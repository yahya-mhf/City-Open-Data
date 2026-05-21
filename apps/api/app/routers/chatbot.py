import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.constants import REDIS_LATEST_PREFIX

from ..core.dependencies import get_db, get_current_user, redis_manager

logger = logging.getLogger("urban_pulse.chatbot")

router = APIRouter(tags=["Chatbot"])


class MapBounds(BaseModel):
    north: float = 0
    south: float = 0
    east: float = 0
    west: float = 0


class Context(BaseModel):
    current_page: str = ""
    current_metric: str | None = None
    map_bounds: MapBounds = Field(default_factory=MapBounds)
    visible_sensors: list[str] = Field(default_factory=list)


class MessageRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    context: Context = Field(default_factory=Context)


MAX_MESSAGES_PER_CONVERSATION = 20
CONVERSATION_TTL_SECONDS = 7200


def _conversation_key(user_id: str, conversation_id: str) -> str:
    return f"chat:{user_id}:{conversation_id}"


async def get_latest_readings(sensor_ids: list[str]) -> list[dict]:
    if not sensor_ids:
        return []
    readings = await redis_manager.get_all_latest_readings(sensor_ids)
    result = []
    for sid, data in readings.items():
        if data:
            result.append({"sensor_id": sid, "data": data})
    return result


async def get_active_alerts(db: AsyncSession, limit: int = 5) -> list[dict]:
    result = await db.execute(
        select(models.Alert)
        .where(models.Alert.acknowledged == False)
        .order_by(models.Alert.created_at.desc())
        .limit(limit)
    )
    alerts = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "sensor_id": a.sensor_id,
            "severity": a.severity,
            "message": a.message,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]


async def get_recent_reports(db: AsyncSession, limit: int = 3) -> list[dict]:
    result = await db.execute(
        select(models.CitizenReport)
        .order_by(models.CitizenReport.created_at.desc())
        .limit(limit)
    )
    reports = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "category": r.category,
            "description": r.description[:200],
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]


async def build_context(
    user_context: Context, db: AsyncSession
) -> dict:
    sensor_data = await get_latest_readings(user_context.visible_sensors)
    active_alerts = await get_active_alerts(db, limit=5)
    recent_reports = await get_recent_reports(db, limit=3)

    intelligence: list = []
    if redis_manager.client:
        keys = await redis_manager.client.keys("intelligence:*")
        if keys:
            raw = await redis_manager.client.mget(keys)
            for item in raw:
                if item:
                    try:
                        parsed = json.loads(item)
                        if isinstance(parsed, list):
                            intelligence.extend(parsed)
                    except (json.JSONDecodeError, TypeError):
                        pass

    return {
        "sensors": sensor_data,
        "alerts": active_alerts,
        "reports": recent_reports,
        "intelligence": intelligence[:10],
        "current_page": user_context.current_page,
        "current_metric": user_context.current_metric,
    }


def _make_system_prompt(context_json: str, user_role: str, current_page: str) -> str:
    return (
        "You are Pulse AI, an AI assistant embedded in the Urban Pulse city monitoring platform "
        "for Marrakech, Morocco. You have access to real-time sensor data, active alerts, "
        "citizen reports, and AI-generated city intelligence insights.\n\n"
        "Your role:\n"
        "- Answer questions about current city conditions using the real data provided\n"
        "- Explain trends, anomalies, and correlations across metrics\n"
        "- Suggest actions for operators based on current readings\n"
        "- Help citizens understand what sensor data means for their daily life\n"
        "- Be concise \u2014 2-4 sentences unless detail is explicitly requested\n"
        "- Always reference specific data values when making claims "
        '("CO2 in Guéliz is currently 847ppm, 23% above the daily average")\n'
        "- If you don't have data to answer something, say so clearly\n"
        "- Never make up sensor readings\n\n"
        "Current platform context:\n{context_json}\n\n"
        f"The user's role is: {user_role} (admin/operator/citizen)\n"
        f"Current page: {current_page}"
    )


async def save_conversation(
    redis, key: str, messages: list[dict], response_text: str
) -> None:
    messages.append({"role": "assistant", "content": response_text})
    if len(messages) > MAX_MESSAGES_PER_CONVERSATION:
        messages = messages[-(MAX_MESSAGES_PER_CONVERSATION):]
    await redis.setex(key, CONVERSATION_TTL_SECONDS, json.dumps(messages, default=str))


@router.post("/message")
async def chat_message(
    req: MessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    conversation_id = req.conversation_id or req.context.current_page or "default"
    conv_key = _conversation_key(current_user["id"], conversation_id)

    messages: list[dict] = []
    if redis_manager.client:
        existing = await redis_manager.client.get(conv_key)
        if existing:
            try:
                messages = json.loads(existing)
            except (json.JSONDecodeError, TypeError):
                messages = []

    messages.append({"role": "user", "content": req.message})
    if len(messages) > MAX_MESSAGES_PER_CONVERSATION:
        messages = messages[-(MAX_MESSAGES_PER_CONVERSATION):]

    context_data = await build_context(req.context, db)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY not configured",
        )

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    system_prompt = _make_system_prompt(
        json.dumps(context_data, default=str),
        current_user.get("role", "citizen"),
        req.context.current_page or "",
    )

    gemini_contents = "\n".join(
        f"{m['role']}: {m['content']}" for m in messages
    )

    async def generate():
        full_response = ""
        stream = await client.aio.models.generate_content_stream(
            model="gemini-2.0-flash",
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=4096,
            ),
        )
        async for chunk in stream:
            if chunk.text:
                full_response += chunk.text
                yield f"data: {json.dumps({'delta': chunk.text})}\n\n"
        yield "data: [DONE]\n\n"

        if redis_manager.client:
            await save_conversation(
                redis_manager.client, conv_key, messages, full_response
            )

    return StreamingResponse(generate(), media_type="text/event-stream")


SUGGESTION_MAP: dict[str, list[str]] = {
    "maps/temperature": [
        "Which zone is hottest right now?",
        "How does today compare to yesterday?",
        "Are there any heat anomalies?",
    ],
    "maps/pollution": [
        "Where is air quality worst right now?",
        "Is pollution levels safe for outdoor activity?",
        "What's causing the CO2 spike in zone 3?",
    ],
    "maps/rainfall": [
        "Is it raining right now?",
        "Which areas are getting the most rain?",
        "Any flood risk zones?",
    ],
    "maps/seismic": [
        "Any recent seismic activity?",
        "Is the city seismically stable right now?",
        "Show me sensor locations near fault lines",
    ],
    "default": [
        "What's the current city status?",
        "Are there any active alerts?",
        "Which area needs attention right now?",
    ],
}


@router.get("/suggestions")
async def get_suggestions(
    current_page: str = Query("", alias="page"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    matched = SUGGESTION_MAP.get(current_page, SUGGESTION_MAP["default"])
    suggestions = list(matched)

    active_alerts = await get_active_alerts(db, limit=5)
    for alert in active_alerts:
        suggestions.append(
            f"There's a {alert['severity']} alert for sensor {alert['sensor_id'][:8]} \u2014 what should I do?"
        )

    return {"suggestions": suggestions}
