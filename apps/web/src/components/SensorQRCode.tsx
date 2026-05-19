"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface SensorQRCodeProps {
  sensorId: string;
  size?: number;
  showDownload?: boolean;
}

export default function SensorQRCode({ sensorId, size = 180, showDownload = true }: SensorQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const domain = typeof window !== "undefined" ? window.location.origin : "https://smartcity.local";
  const qrUrl = `${domain}/sensors/${sensorId}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, qrUrl, {
      width: size,
      margin: 2,
      color: { dark: "#1e293b", light: "#ffffff" },
    });
  }, [sensorId, size, qrUrl]);

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `sensor-${sensorId}-qr.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} />
      <p className="text-xs text-gray-500 text-center break-all max-w-[200px]">{qrUrl}</p>
      {showDownload && (
        <button
          onClick={downloadQR}
          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
        >
          Download QR
        </button>
      )}
    </div>
  );
}
