"use client";

import { useEffect, useState, useRef } from "react";

interface SeismicEvent {
  sensor_id: string;
  value: number;
  timestamp: string;
}

interface SeismicAlertModalProps {
  event: SeismicEvent | null;
  onDismiss: () => void;
}

export default function SeismicAlertModal({ event, onDismiss }: SeismicAlertModalProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (event) {
      setVisible(true);
      // Auto-dismiss after 30 seconds
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // wait for animation
      }, 30000);

      // Play 440Hz beep using Web Audio API
      try {
        audioRef.current = new AudioContext();
        const oscillator = audioRef.current.createOscillator();
        const gain = audioRef.current.createGain();
        oscillator.connect(gain);
        gain.connect(audioRef.current.destination);
        oscillator.frequency.value = 440;
        oscillator.type = "sine";
        gain.gain.value = 0.3;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.01, audioRef.current.currentTime + 0.5);
        oscillator.stop(audioRef.current.currentTime + 0.5);
      } catch {}
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) audioRef.current.close();
    };
  }, [event, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  if (!event) return null;

  const location = event.sensor_id?.split("-").slice(0, 2).join(" ") || "Unknown location";
  const time = event.timestamp
    ? new Date(event.timestamp).toLocaleString()
    : "Just now";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute inset-0 bg-black/80" onClick={handleDismiss} />
      <div className="relative bg-[#1a1a2e] border-4 border-red-500 rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-4 text-center">
        <div className="text-6xl mb-4">&#x1F4A2;</div>
        <h2 className="text-3xl font-bold text-red-400 mb-2">Seismic Event Detected</h2>
        <div className="text-5xl font-bold text-white my-4">
          {event.value.toFixed(2)}
          <span className="text-xl text-gray-400 ml-2">richter</span>
        </div>
        <p className="text-lg text-gray-300 mb-2">
          Near <strong className="text-white">{location}</strong>
        </p>
        <p className="text-sm text-gray-500 mb-6">{time}</p>
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 mb-6">
          <p className="text-red-300 text-sm">
            If you feel shaking, drop, cover, and hold on. Check your surroundings for hazards.
            Avoid elevators and stay away from windows.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="px-8 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
        >
          Dismiss
        </button>
        <p className="text-gray-600 text-xs mt-4">Auto-dismisses in 30 seconds</p>
      </div>
    </div>
  );
}
