import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from smart_city_shared.constants import REDIS_LATEST_PREFIX

from .redis_client import redis_manager

websocket_router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.sensor_connections: list[WebSocket] = []
        self.alert_connections: list[WebSocket] = []
        self.report_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        await websocket.accept()
        if channel == "sensors":
            self.sensor_connections.append(websocket)
        elif channel == "alerts":
            self.alert_connections.append(websocket)
        elif channel == "reports":
            self.report_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        if channel == "sensors":
            self.sensor_connections.remove(websocket)
        elif channel == "alerts":
            self.alert_connections.remove(websocket)
        elif channel == "reports":
            self.report_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any], channel: str) -> None:
        connections = []
        if channel == "sensors":
            connections = self.sensor_connections
        elif channel == "alerts":
            connections = self.alert_connections
        elif channel == "reports":
            connections = self.report_connections

        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


async def redis_subscriber() -> None:
    if not redis_manager.client:
        return
    pubsub = redis_manager.client.pubsub()
    await pubsub.psubscribe("__keyspace@0__:*")

    # Also subscribe to seismic_events channel
    await pubsub.subscribe("seismic_events")

    async for message in pubsub.listen():
        if message["type"] == "pmessage":
            channel = message["channel"]
            if isinstance(channel, bytes):
                channel = channel.decode()
            if REDIS_LATEST_PREFIX.split("{")[0].rstrip(":") in channel:
                await manager.broadcast(
                    {"type": "sensor_update", "data": {"key": channel}},
                    "sensors",
                )
        elif message["type"] == "message" and message["channel"] == "seismic_events":
            try:
                data = json.loads(message["data"])
                await manager.broadcast(data, "alerts")
            except (json.JSONDecodeError, Exception):
                pass


@websocket_router.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    if channel not in ("sensors", "alerts", "reports"):
        await websocket.close(code=4000)
        return

    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("ping"):
                    await websocket.send_json({"pong": True})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
