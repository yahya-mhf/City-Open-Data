"use client";

import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function HomeContent() {
  const { user, loading, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Smart City Platform</h1>
          <nav className="flex gap-4 items-center">
            {loading ? (
              <span className="text-gray-400">Loading...</span>
            ) : user ? (
              <>
                <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">
                  Dashboard
                </Link>
                <Link href="/map" className="text-gray-600 hover:text-primary-600">
                  Map
                </Link>
                <Link href="/account" className="text-gray-600 hover:text-primary-600">
                  Account
                </Link>
                <span className="text-sm text-gray-500">{user.full_name}</span>
                <button
                  onClick={() => logout()}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-4 py-20 text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Monitor Your City in Real Time
          </h2>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Environmental monitoring platform tracking air quality, weather, noise levels,
            and more across your city. Real-time data from thousands of sensors.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/map"
              className="px-8 py-3 bg-primary-600 text-white rounded-lg text-lg font-semibold hover:bg-primary-700"
            >
              View Map
            </Link>
            <Link
              href="/register"
              className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg text-lg font-semibold hover:bg-gray-50"
            >
              Get Started
            </Link>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="text-xl font-semibold mb-2">Real-Time Monitoring</h3>
              <p className="text-gray-600">
                Live sensor data updated every 30 minutes with instant alerting
              </p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Historical Analytics</h3>
              <p className="text-gray-600">
                Track trends with long-term time-series data storage
              </p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-xl font-semibold mb-2">Citizen Reports</h3>
              <p className="text-gray-600">
                Report issues in your city and track their resolution
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-800 text-white py-8 text-center">
        <p>Smart City Monitoring Platform &copy; 2026</p>
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
