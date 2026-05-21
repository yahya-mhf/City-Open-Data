"use client";

import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";

function HomeContent() {
  const { user, loading, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white/80 dark:bg-night-secondary/80 backdrop-blur-md border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700 dark:text-brand-500">Urban Pulse</h1>
          <nav className="flex gap-4 items-center">
            {loading ? (
              <span className="text-gray-400">Loading...</span>
            ) : user ? (
              <>
                <Link href="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-brand-500">
                  Dashboard
                </Link>
                <Link href="/map" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-brand-500">
                  Map
                </Link>
                <Link href="/maps" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-brand-500">
                  Maps
                </Link>
                <Link href="/account" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-brand-500">
                  Account
                </Link>
                <Link href="/developer" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-brand-500">
                  Developer
                </Link>
                <span className="text-sm text-gray-500 dark:text-gray-400">{user.full_name}</span>
                <button
                  onClick={() => logout()}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-primary-600 dark:text-brand-500 border border-primary-600 dark:border-brand-500 rounded-lg hover:bg-primary-50 dark:hover:bg-brand-900/20"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-primary-600 dark:bg-brand-600 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-brand-700"
                >
                  Register
                </Link>
              </>
            )}
            <button
              onClick={() => {}}
              className="text-lg text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-brand-500 transition"
              title="Toggle night mode"
            >
              {"\uD83C\uDF19"}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1117] via-[#0c4a6e] to-[#0f1117] py-24">
          {/* City skyline SVG at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-24 opacity-20">
            <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="h-full w-full">
              <rect x="0" y="40" width="30" height="60" fill="white" opacity="0.3" />
              <rect x="35" y="20" width="25" height="80" fill="white" opacity="0.25" />
              <rect x="65" y="50" width="20" height="50" fill="white" opacity="0.2" />
              <rect x="90" y="30" width="35" height="70" fill="white" opacity="0.3" />
              <rect x="130" y="10" width="20" height="90" fill="white" opacity="0.2" />
              <rect x="155" y="45" width="25" height="55" fill="white" opacity="0.25" />
              <rect x="185" y="25" width="30" height="75" fill="white" opacity="0.3" />
              <rect x="220" y="55" width="20" height="45" fill="white" opacity="0.2" />
              <rect x="245" y="15" width="25" height="85" fill="white" opacity="0.25" />
              <rect x="275" y="35" width="35" height="65" fill="white" opacity="0.3" />
              <rect x="315" y="50" width="20" height="50" fill="white" opacity="0.2" />
              <rect x="340" y="20" width="30" height="80" fill="white" opacity="0.25" />
              <rect x="375" y="5" width="20" height="95" fill="white" opacity="0.2" />
              <rect x="400" y="40" width="25" height="60" fill="white" opacity="0.3" />
              <rect x="430" y="25" width="35" height="75" fill="white" opacity="0.25" />
              <rect x="470" y="55" width="20" height="45" fill="white" opacity="0.2" />
              <rect x="495" y="10" width="30" height="90" fill="white" opacity="0.3" />
              <rect x="530" y="30" width="25" height="70" fill="white" opacity="0.25" />
              <rect x="560" y="45" width="20" height="55" fill="white" opacity="0.2" />
              <rect x="585" y="15" width="35" height="85" fill="white" opacity="0.3" />
              <rect x="625" y="50" width="25" height="50" fill="white" opacity="0.2" />
              <rect x="655" y="20" width="30" height="80" fill="white" opacity="0.25" />
              <rect x="690" y="35" width="20" height="65" fill="white" opacity="0.3" />
              <rect x="715" y="5" width="35" height="95" fill="white" opacity="0.2" />
              <rect x="755" y="40" width="25" height="60" fill="white" opacity="0.25" />
              <rect x="785" y="25" width="30" height="75" fill="white" opacity="0.3" />
              <rect x="820" y="55" width="20" height="45" fill="white" opacity="0.2" />
              <rect x="845" y="10" width="25" height="90" fill="white" opacity="0.25" />
              <rect x="875" y="30" width="35" height="70" fill="white" opacity="0.3" />
              <rect x="915" y="45" width="20" height="55" fill="white" opacity="0.2" />
              <rect x="940" y="15" width="30" height="85" fill="white" opacity="0.25" />
              <rect x="975" y="50" width="25" height="50" fill="white" opacity="0.2" />
              <rect x="1005" y="20" width="35" height="80" fill="white" opacity="0.3" />
              <rect x="1045" y="35" width="20" height="65" fill="white" opacity="0.25" />
              <rect x="1070" y="5" width="25" height="95" fill="white" opacity="0.2" />
              <rect x="1100" y="40" width="30" height="60" fill="white" opacity="0.3" />
              <rect x="1135" y="25" width="20" height="75" fill="white" opacity="0.25" />
              <rect x="1160" y="50" width="35" height="50" fill="white" opacity="0.2" />
            </svg>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 text-center">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Monitor Your City in Real Time
            </h2>
            <p className="text-xl text-blue-200/80 mb-10 max-w-2xl mx-auto">
              Environmental monitoring platform tracking temperature, humidity, rainfall, CO2, and seismic activity across Marrakech. Real-time data from a network of smart sensors.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/map"
                className="px-8 py-3 bg-brand-600 text-white rounded-lg text-lg font-semibold hover:bg-brand-700 transition shadow-lg shadow-brand-600/25"
              >
                View Map
              </Link>
              <Link
                href="/register"
                className="px-8 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-lg text-lg font-semibold hover:bg-white/20 transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-night-secondary py-16">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card p-8 text-center">
              <div className="text-4xl mb-4">{"\uD83C\uDF0D"}</div>
              <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Real-Time Monitoring</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Live sensor data updated every 30 minutes with instant alerting for critical conditions
              </p>
            </div>
            <div className="card p-8 text-center">
              <div className="text-4xl mb-4">{"\uD83D\uDCCA"}</div>
              <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Historical Analytics</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Track trends with long-term time-series data storage and AI-powered forecasting
              </p>
            </div>
            <div className="card p-8 text-center">
              <div className="text-4xl mb-4">{"\uD83D\uDCDD"}</div>
              <h3 className="text-xl font-semibold mb-2 dark:text-gray-100">Citizen Reports</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Report issues in your city and track their resolution in real time
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-800 dark:bg-night-primary text-white py-8 text-center">
        <p>Urban Pulse Monitoring Platform &copy; 2026</p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeContent />
    </AuthProvider>
  );
}
