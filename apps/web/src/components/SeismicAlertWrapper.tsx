"use client";

import { useEffect, useState, useCallback } from "react";
import { createWebSocket } from "@/lib/api";
import SeismicAlertModal from "./SeismicAlertModal";

interface SeismicEvent {
  sensor_id: string;
  value: number;
  timestamp: string;
}

export default function SeismicAlertWrapper() {
  const [event, setEvent] = useState<SeismicEvent | null>(null);

  const handleDismiss = useCallback(() => {
    setEvent(null);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let backoffRef = 1000;

    const connect = () => {
      try {
        ws = createWebSocket("alerts");
        ws.onopen = () => {
          backoffRef = 1000;
        };
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.type === "seismic_event" && data.value > 2.5) {
              setEvent({
                sensor_id: data.sensor_id || "unknown",
                value: data.value,
                timestamp: data.timestamp || new Date().toISOString(),
              });
            }
          } catch {}
        };
        ws.onclose = () => {
          const delay = Math.min(backoffRef, 30000);
          backoffRef = Math.min(backoffRef * 2, 30000);
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch {}
    };

    backoffRef = 1000;
    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  return <SeismicAlertModal event={event} onDismiss={handleDismiss} />;
}
