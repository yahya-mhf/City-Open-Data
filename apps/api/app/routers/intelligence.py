import hashlib
import json
import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from ..core.dependencies import get_db, redis_manager

logger = logging.getLogger("smart_city.intelligence")

router = APIRouter()

_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not _GROQ_API_KEY:
    logger.warning("GROQ_API_KEY not configured — intelligence will fail")
_groq_client: AsyncOpenAI | None = None
if _GROQ_API_KEY:
    _groq_client = AsyncOpenAI(api_key=_GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")


class BBoxModel(BaseModel):
    north: float
    south: float
    east: float
    west: float


class AnalyzeRequest(BaseModel):
    metric_keys: list[str]
    bbox: BBoxModel
    analysis_type: str = Field(pattern=r"^(opportunities|risks|infrastructure|environment)$")


def _ai_unavailable(reason: str, analysis_type: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "available": False,
        "status": "unavailable",
        "source": "unavailable",
        "reason": reason,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "suggestions": [],
    }
    if analysis_type:
        result["analysis_type"] = analysis_type
    return result


def _bbox_hash(bbox: BBoxModel) -> str:
    raw = f"{bbox.north:.6f}|{bbox.south:.6f}|{bbox.east:.6f}|{bbox.west:.6f}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _pearson_correlation(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n < 3:
        return 0.0
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(a * b for a, b in zip(x, y))
    sum_x2 = sum(a * a for a in x)
    sum_y2 = sum(b * b for b in y)
    numerator = n * sum_xy - sum_x * sum_y
    denominator = math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y))
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _compute_correlations(
    context_metrics: dict[str, Any],
    hourly_maps: dict[str, dict[str, list[dict[str, Any]]]],
    max_distance: float = 200.0,
    min_correlation: float = 0.6,
) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    for mk, mc in context_metrics.items():
        hourly = hourly_maps.get(mk, {})
        for s in mc["sensors"]:
            sid = s["sensor_id"]
            series_list = hourly.get(sid, [])
            series = {b["bucket"]: b["avg_value"] for b in series_list if b["avg_value"] is not None}
            if len(series) >= 3:
                observations.append({
                    "metric_key": mk,
                    "sensor_id": sid,
                    "lat": s["lat"],
                    "lon": s["lon"],
                    "series": series,
                })

    results: list[dict[str, Any]] = []
    n = len(observations)
    for i in range(n):
        for j in range(i + 1, n):
            a = observations[i]
            b = observations[j]
            dist = _haversine(a["lat"], a["lon"], b["lat"], b["lon"])
            if dist > max_distance:
                continue

            common_keys = [k for k in a["series"] if k in b["series"]]
            if len(common_keys) < 3:
                continue

            vals_a = [a["series"][k] for k in common_keys]
            vals_b = [b["series"][k] for k in common_keys]
            corr = _pearson_correlation(vals_a, vals_b)

            if abs(corr) > min_correlation:
                results.append({
                    "sensor_a": a["sensor_id"],
                    "sensor_b": b["sensor_id"],
                    "metric_a": a["metric_key"],
                    "metric_b": b["metric_key"],
                    "correlation": round(corr, 4),
                    "distance_meters": round(dist, 1),
                })

    return results


async def _collect_metric_context(
    metric_key: str, bbox: BBoxModel, db: AsyncSession
) -> tuple[dict[str, Any] | None, dict[str, list[dict[str, Any]]]]:
    metric_result = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.key == metric_key)
    )
    metric = metric_result.scalar_one_or_none()
    if not metric:
        return None, {}

    sensors_result = await db.execute(
        select(models.Sensor).where(
            models.Sensor.status == "active",
            models.Sensor.latitude >= bbox.south,
            models.Sensor.latitude <= bbox.north,
            models.Sensor.longitude >= bbox.west,
            models.Sensor.longitude <= bbox.east,
        )
    )
    sensors = sensors_result.scalars().all()
    if not sensors:
        return None, {}

    sensor_ids = [str(s.id) for s in sensors]
    sensor_map = {str(s.id): s for s in sensors}

    latest_readings = await redis_manager.get_all_latest_readings(sensor_ids)

    sensors_with_vals: list[dict[str, Any]] = []
    sensors_needing_db: list[str] = []

    for sid in sensor_ids:
        latest = latest_readings.get(sid)
        if latest and isinstance(latest, dict) and "metrics" in latest and metric_key in latest["metrics"]:
            sensors_with_vals.append({"sensor": sensor_map[sid], "value": latest["metrics"][metric_key]})
        else:
            sensors_needing_db.append(sid)

    if sensors_needing_db:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        latest_times_subq = (
            select(
                models.SensorReading.sensor_id,
                func.max(models.SensorReading.time).label("max_time"),
            )
            .where(
                models.SensorReading.metric_id == metric.id,
                models.SensorReading.time >= since,
                models.SensorReading.sensor_id.in_(sensors_needing_db),
            )
            .group_by(models.SensorReading.sensor_id)
            .subquery()
        )
        db_latest = (
            select(
                models.SensorReading.sensor_id,
                models.SensorReading.value_numeric,
            )
            .join(
                latest_times_subq,
                and_(
                    models.SensorReading.sensor_id == latest_times_subq.c.sensor_id,
                    models.SensorReading.time == latest_times_subq.c.max_time,
                ),
            )
            .where(models.SensorReading.metric_id == metric.id)
        )
        db_rows = (await db.execute(db_latest)).all()
        for row in db_rows:
            if row.value_numeric is not None:
                sensors_with_vals.append({"sensor": sensor_map[row.sensor_id], "value": row.value_numeric})

    if not sensors_with_vals:
        return None, {}

    all_sids = [str(s["sensor"].id) for s in sensors_with_vals]
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    hourly_query = text("""
        SELECT sensor_id, bucket, avg_value
        FROM sensor_readings_hourly
        WHERE metric_id = :metric_id
          AND sensor_id = ANY(:sensor_ids)
          AND bucket >= :since
        ORDER BY sensor_id, bucket ASC
    """)
    hourly_rows = (await db.execute(
        hourly_query,
        {"metric_id": metric.id, "sensor_ids": all_sids, "since": since},
    )).all()

    hourly_map: dict[str, list[dict[str, Any]]] = {}
    for row in hourly_rows:
        sid = row.sensor_id
        if sid not in hourly_map:
            hourly_map[sid] = []
        hourly_map[sid].append({
            "bucket": row.bucket.isoformat() if hasattr(row.bucket, "isoformat") else str(row.bucket),
            "avg_value": row.avg_value,
        })

    result_sensors: list[dict[str, Any]] = []
    for entry in sensors_with_vals:
        sensor = entry["sensor"]
        sid = str(sensor.id)
        current_value = entry["value"]
        hourly_data = hourly_map.get(sid, [])
        avg_24h = sum(h["avg_value"] for h in hourly_data) / len(hourly_data) if hourly_data else None

        trend = "stable"
        if hourly_data and len(hourly_data) >= 2 and avg_24h is not None:
            diff = current_value - avg_24h
            threshold = abs(avg_24h) * 0.05 if avg_24h != 0 else 0.01
            if diff > threshold:
                trend = "up"
            elif diff < -threshold:
                trend = "down"

        result_sensors.append({
            "sensor_id": sid,
            "name": sensor.name,
            "lat": sensor.latitude,
            "lon": sensor.longitude,
            "current_value": current_value,
            "avg_24h": avg_24h,
            "trend": trend,
        })

    return {
        "unit": metric.unit,
        "sensors": result_sensors,
    }, hourly_map


@router.post("/analyze")
async def analyze_endpoint(
    req: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    bhash = _bbox_hash(req.bbox)
    cache_key = f"intelligence:{req.analysis_type}:{bhash}"
    if redis_manager.client:
        cached = await redis_manager.client.get(cache_key)
        if cached:
            parsed = json.loads(cached)
            now = datetime.now(timezone.utc)
            if isinstance(parsed, list):
                generated_at = now.isoformat()
                return {
                    "available": True,
                    "status": "cached",
                    "source": "cached",
                    "analysis_type": req.analysis_type,
                    "generated_at": generated_at,
                    "cached_at": generated_at,
                    "cache_age_seconds": 0,
                    "suggestions": parsed,
                }
            generated_at = parsed.get("generated_at") or now.isoformat()
            try:
                generated_dt = datetime.fromisoformat(generated_at)
                cache_age_seconds = max(0, int((now - generated_dt).total_seconds()))
            except (TypeError, ValueError):
                cache_age_seconds = 0
            return {
                **parsed,
                "available": True,
                "status": "cached",
                "source": "cached",
                "analysis_type": req.analysis_type,
                "cache_age_seconds": cache_age_seconds,
            }

    context_metrics: dict[str, Any] = {}
    hourly_maps: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for mk in req.metric_keys:
        mc, hm = await _collect_metric_context(mk, req.bbox, db)
        if mc:
            context_metrics[mk] = mc
            hourly_maps[mk] = hm

    if not context_metrics:
        return {
            "available": True,
            "status": "live",
            "source": "live",
            "analysis_type": req.analysis_type,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "suggestions": [],
        }

    correlations = _compute_correlations(context_metrics, hourly_maps)

    context: dict[str, Any] = {
        "analysis_type": req.analysis_type,
        "metrics": context_metrics,
    }
    if correlations:
        context["correlations"] = correlations

    if not _groq_client:
        return _ai_unavailable("Groq not configured", req.analysis_type)

    system_prompt = (
        "You are a city intelligence analyst. You receive real sensor data from a smart city "
        "platform and return actionable insights as structured JSON only. Never return prose outside the JSON. "
        "Pay special attention to the correlations array — these are metrics that move together in the same "
        "geographic area. Use them to generate multi-metric insights that would not be visible from any single layer alone."
    )
    user_prompt = (
        "Analyze this smart city sensor data and return a JSON array of suggestions. "
        "Each suggestion must have:\n"
        "- id: unique string\n"
        "- type: one of \"opportunity\" | \"risk\" | \"recommendation\" | \"alert\"\n"
        "- title: short title (max 8 words)\n"
        "- description: 2-3 sentence explanation referencing the actual data values\n"
        "- lat: float (center latitude of the relevant area)\n"
        "- lon: float (center longitude of the relevant area)\n"
        "- radius_meters: int (affected area radius)\n"
        "- severity: \"low\" | \"medium\" | \"high\"\n"
        "- metrics_involved: [metric_key strings]\n"
        "- confidence: float 0-1\n\n"
        "Base lat/lon on the sensor locations in the data. "
        "Return only the JSON array, no wrapper object.\n\n"
        f"Data: {json.dumps(context)}"
    )

    try:
        response = await _groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=4096,
        )

        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        logger.info(
            "Groq API call completed",
            extra={
                "analysis_type": req.analysis_type,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "metric_keys": list(context_metrics.keys()),
            },
        )

        content = response.choices[0].message.content
        suggestions = json.loads(content)
        if isinstance(suggestions, dict) and isinstance(suggestions.get("suggestions"), list):
            suggestions = suggestions["suggestions"]
        if not isinstance(suggestions, list):
            raise ValueError("Response is not a JSON array")

        required = {"id", "type", "title", "description", "lat", "lon", "radius_meters", "severity", "metrics_involved", "confidence"}
        valid_types = {"opportunity", "risk", "recommendation", "alert"}
        valid_severity = {"low", "medium", "high"}

        validated: list[dict[str, Any]] = []
        for s in suggestions:
            if not required.issubset(s.keys()):
                continue
            if s["type"] not in valid_types:
                continue
            if s["severity"] not in valid_severity:
                continue
            if not isinstance(s["confidence"], (int, float)) or not 0 <= s["confidence"] <= 1:
                continue
            validated.append(s)

        generated_at = datetime.now(timezone.utc).isoformat()
        result = {
            "available": True,
            "status": "live",
            "source": "live",
            "analysis_type": req.analysis_type,
            "generated_at": generated_at,
            "suggestions": validated,
        }
        if redis_manager.client:
            await redis_manager.client.setex(cache_key, 1800, json.dumps(result, default=str))

        return result

    except Exception as e:
        logger.error("Groq API call failed", extra={"error": str(e), "analysis_type": req.analysis_type})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI analysis failed: {e}",
        )


BRIEFING_CACHE_KEY = "daily_briefing"
BRIEFING_CACHE_TTL = 21600  # 6 hours


@router.get("/briefing")
async def get_daily_briefing(
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    if redis_manager.client and not refresh:
        cached = await redis_manager.client.get(BRIEFING_CACHE_KEY)
        if cached:
            parsed = json.loads(cached)
            generated_at = parsed.get("generated_at")
            cache_age_seconds = 0
            if generated_at:
                try:
                    generated_dt = datetime.fromisoformat(generated_at)
                    cache_age_seconds = max(
                        0,
                        int((datetime.now(timezone.utc) - generated_dt).total_seconds()),
                    )
                except (TypeError, ValueError):
                    cache_age_seconds = 0
            return {
                **parsed,
                "available": parsed.get("available", True),
                "status": "cached",
                "source": "cached",
                "cached": True,
                "cache_age_seconds": cache_age_seconds,
            }

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    sensors = await db.execute(select(models.Sensor).where(models.Sensor.status == "active"))
    all_sensors = sensors.scalars().all()
    sensor_ids = [s.id for s in all_sensors]

    metric_defs = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.is_active == True)
    )
    all_metrics = metric_defs.scalars().all()
    metric_id_map = {str(m.id): m.key for m in all_metrics}

    if not sensor_ids or not metric_id_map:
        return {
            "available": False,
            "status": "unavailable",
            "source": "unavailable",
            "reason": "Sensor data unavailable",
            "paragraphs": [],
            "generated_at": now.isoformat(),
            "cached": False,
        }

    hour_bucket = sa_func.time_bucket(text("'1 hour'::interval"), models.SensorReading.time)
    hourly = await db.execute(
        select(
            models.SensorReading.metric_id,
            hour_bucket.label("bucket"),
            sa_func.avg(models.SensorReading.value_numeric).label("avg_val"),
        ).where(
            models.SensorReading.sensor_id.in_(sensor_ids),
            models.SensorReading.time >= since,
            models.SensorReading.value_numeric.isnot(None),
        ).group_by(
            models.SensorReading.metric_id,
            hour_bucket,
        ).order_by(
            models.SensorReading.metric_id,
            hour_bucket,
        )
    )
    hourly_rows = hourly.all()

    metric_summaries: dict[str, dict[str, Any]] = {}
    for row in hourly_rows:
        key = metric_id_map.get(str(row.metric_id))
        if not key:
            continue
        if key not in metric_summaries:
            metric_summaries[key] = {"values": [], "min": float("inf"), "max": float("-inf")}
        v = float(row.avg_val)
        metric_summaries[key]["values"].append(v)
        metric_summaries[key]["min"] = min(metric_summaries[key]["min"], v)
        metric_summaries[key]["max"] = max(metric_summaries[key]["max"], v)

    for k, v in metric_summaries.items():
        vals = v["values"]
        v["avg"] = sum(vals) / len(vals) if vals else 0
        v["current"] = vals[-1] if vals else 0

    anomaly_events = await db.execute(
        select(models.Alert).where(
            models.Alert.created_at >= since,
            models.Alert.severity.in_(["warning", "critical"]),
        ).order_by(models.Alert.created_at.desc()).limit(10)
    )
    anomaly_rows = anomaly_events.scalars().all()

    anomaly_text = ""
    if anomaly_rows:
        events = []
        for a in anomaly_rows:
            events.append(f"sensor={a.sensor_id} severity={a.severity} message={a.message} time={a.created_at.isoformat()}")
        anomaly_text = "\nRecent alerts:\n" + "\n".join(events)

    district_summaries: dict[str, list[str]] = {}
    for s in all_sensors:
        district = s.type if hasattr(s, "type") else "unknown"
        district_summaries.setdefault(district, [])

    if not _groq_client:
        return {
            "available": False,
            "status": "unavailable",
            "source": "unavailable",
            "reason": "Groq not configured",
            "paragraphs": [],
            "generated_at": now.isoformat(),
            "cached": False,
        }
    else:
        summary_lines = []
        for k, v in metric_summaries.items():
            summary_lines.append(f"- {k}: current {v['current']:.1f}, 24h avg {v['avg']:.1f}, range [{v['min']:.1f}-{v['max']:.1f}]")
        summary_text = "\n".join(summary_lines)

        prompt = (
            "You are a city intelligence analyst for Marrakech, Morocco. "
            "Write a concise daily morning briefing in exactly 3 paragraphs based on the last 24 hours of sensor data.\n\n"
            f"City context: Marrakech is a hot semi-arid city. Current time: {now.isoformat()}. "
            f"Active sensors: {len(all_sensors)}. "
            f"Metrics tracked: {', '.join(sorted(metric_summaries.keys()))}.\n\n"
            f"24-hour metric summaries:\n{summary_text}\n"
            f"{anomaly_text}\n\n"
            "Paragraph 1: Overnight recap — summarize the most notable readings, trends, and any anomalies.\n"
            "Paragraph 2: Today's risks — forecast today's likely conditions, highlight any concerning metrics, and explain why.\n"
            "Paragraph 3: One actionable recommendation — what the city operator should do today, referencing specific locations or districts.\n\n"
            "Return ONLY a JSON object with a single key 'paragraphs' containing an array of exactly 3 strings. "
            "Do not wrap in markdown. Example: {\"paragraphs\": [\"...\", \"...\", \"...\"]}"
        )

        try:
            response = await _groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a city intelligence analyst. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=2048,
                temperature=0.7,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            parsed = json.loads(content)
            paragraphs = parsed.get("paragraphs", [])
            if not isinstance(paragraphs, list) or len(paragraphs) != 3:
                raise ValueError("Expected exactly 3 paragraphs")
        except Exception as e:
            logger.error("Briefing generation failed", extra={"error": str(e)})
            return {
                "available": False,
                "status": "unavailable",
                "source": "unavailable",
                "reason": "AI briefing generation failed",
                "paragraphs": [],
                "generated_at": now.isoformat(),
                "cached": False,
            }

    result = {
        "available": True,
        "status": "live",
        "source": "live",
        "paragraphs": paragraphs,
        "generated_at": now.isoformat(),
        "cached": False,
    }

    if redis_manager.client:
        await redis_manager.client.set(BRIEFING_CACHE_KEY, json.dumps(result, default=str), ex=BRIEFING_CACHE_TTL)

    return result


@router.get("/suggestions")
async def get_suggestions(
    analysis_type: str = Query(...),
    north: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    west: float = Query(...),
):
    bbox = BBoxModel(north=north, south=south, east=east, west=west)
    bhash = _bbox_hash(bbox)
    cache_key = f"intelligence:{analysis_type}:{bhash}"

    if redis_manager.client:
        cached = await redis_manager.client.get(cache_key)
        if cached:
            parsed = json.loads(cached)
            if isinstance(parsed, list):
                return parsed
            return parsed.get("suggestions", [])
    return []
