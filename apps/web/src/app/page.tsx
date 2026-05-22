"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import CityHealth from "@/components/CityHealth";
import DailyBriefing from "@/components/DailyBriefing";

const HeroMap = dynamic(() => import("@/components/HeroMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0f1117] via-[#0c4a6e] to-[#0f1117]" />
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function HomeContent() {
  const { user, loading, logout } = useAuth();
  const { nightMode, toggleNightMode, demoMode, toggleDemoMode } = useTheme();
  const [sensorCount, setSensorCount] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const featuresRef = useRef<HTMLElement>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/city-stats`);
      if (res.ok) {
        const data = await res.json();
        setSensorCount(data.sensor_count);
        setAlertCount(data.alert_count);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-night-primary">
      <header className="relative z-20 bg-white/70 dark:bg-night-secondary/70 backdrop-blur-md border-b border-gray-200/50 dark:border-night-border/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700 dark:text-brand-500">Urban Pulse</h1>
          <nav className="flex gap-4 items-center">
            {loading ? (
              <span className="text-gray-400 text-sm">Loading...</span>
            ) : user ? (
              <>
                <Link href="/dashboard" className="text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600">Dashboard</Link>
                <Link href="/map" className="text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600">Map</Link>
                <Link href="/maps" className="text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600">Maps</Link>
                <Link href="/account" className="text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600">Account</Link>
                <span className="text-sm text-gray-500">{user.full_name}</span>
                <button onClick={() => logout()} className="text-sm text-red-600 hover:text-red-800">Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50">Login</Link>
                <Link href="/register" className="text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Register</Link>
              </>
            )}
            <button onClick={toggleDemoMode} className={`text-xs px-2 py-1 rounded-full transition ${demoMode ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}>
              {demoMode ? "DEMO ON" : "Demo"}
            </button>
            <button onClick={toggleNightMode} className="text-gray-600 dark:text-gray-300 hover:text-primary-600 text-lg">{nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}</button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ───── HERO ───── */}
        <section className="relative h-[90vh] min-h-[600px] overflow-hidden">
          <HeroMap />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
            <div className="backdrop-blur-xl bg-white/10 dark:bg-black/30 border border-white/20 rounded-3xl p-10 md:p-14 max-w-2xl w-full shadow-2xl">
              <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                Urban Pulse
              </h1>
              <p className="text-xl md:text-2xl text-white/80 mb-8 font-light">
                Real-time city intelligence for Marrakech
              </p>

              <div className="flex justify-center gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">
                    {sensorCount !== null ? sensorCount : <span className="animate-pulse">--</span>}
                  </div>
                  <div className="text-xs text-white/60 uppercase tracking-wider mt-1">Sensors</div>
                </div>
                <div className="w-px bg-white/20" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-400">
                    {alertCount !== null ? alertCount : <span className="animate-pulse">--</span>}
                  </div>
                  <div className="text-xs text-white/60 uppercase tracking-wider mt-1">Active Alerts</div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/map"
                  className="px-8 py-3 bg-brand-600 text-white rounded-xl text-lg font-semibold hover:bg-brand-700 transition shadow-lg shadow-brand-600/30"
                >
                  View Live Map
                </Link>
                <Link
                  href="/developer"
                  className="px-8 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-lg font-semibold hover:bg-white/20 transition"
                >
                  Read API Docs
                </Link>
                <button
                  onClick={scrollToFeatures}
                  className="px-8 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-lg font-semibold hover:bg-white/20 transition"
                >
                  Watch Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ───── CITY HEALTH DASHBOARD ───── */}
        <CityHealth />

        {/* ───── DAILY AI BRIEFING ───── */}
        <DailyBriefing />

        {/* ───── FEATURES ───── */}
        <section ref={featuresRef} className="bg-white dark:bg-night-primary py-20 scroll-mt-8">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-gray-100">Platform Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="card p-8 text-center hover:shadow-lg transition-shadow">
                <div className="text-4xl mb-4">{"\uD83C\uDF0D"}</div>
                <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Real-Time Monitoring</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Live sensor data updated every 30 minutes with instant alerting for critical conditions
                </p>
              </div>
              <div className="card p-8 text-center hover:shadow-lg transition-shadow">
                <div className="text-4xl mb-4">{"\uD83D\uDCCA"}</div>
                <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Historical Analytics</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Track trends with long-term time-series data storage and AI-powered forecasting
                </p>
              </div>
              <div className="card p-8 text-center hover:shadow-lg transition-shadow">
                <div className="text-4xl mb-4">{"\uD83D\uDCDD"}</div>
                <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Citizen Reports</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Report issues in your city and track their resolution in real time
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 dark:bg-night-primary text-white py-8 text-center text-sm">
        <p>Urban Pulse Monitoring Platform &copy; 2026</p>
      </footer>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
