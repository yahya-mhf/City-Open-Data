"use client";

import { useEffect, useState, useCallback } from "react";
import { createWebSocket } from "@/lib/api";
import SeismicAlertModal from "./SeismicAlertModal";

interface SeismicEvent {
  sensor_id: string;
  value: number;
  timestamp: string;
}

const SUPPRESS_MS = 10 * 60 * 1000;
const LS_KEY = "seismic_alert_dismissed_at";

function isSuppressed(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(LS_KEY);
  if (!stored) return false;
  return Date.now() < parseInt(stored, 10);
}

function setSuppressed(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, String(Date.now() + SUPPRESS_MS));
}

export default function SeismicAlertWrapper() {
  const [event, setEvent] = useState<SeismicEvent | null>(null);

  const handleDismiss = useCallback(() => {
    setSuppressed();
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
            if (data.type === "seismic_event") {
              if (data.value > 3.0 && !isSuppressed()) {
                setEvent({
                  sensor_id: data.sensor_id || "unknown",
                  value: data.value,
                  timestamp: data.timestamp || new Date().toISOString(),
                });
              } else if (data.value <= 3.0) {
                console.log("[SeismicAlert] Below-threshold event suppressed:", data.value.toFixed(2), "richter");
              }
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
