"use client";

import Link from "next/link";
import { useTheme } from "@/lib/theme-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ExportPanel } from "@/components/ExportPanel";

function ExportPageContent() {
  const { nightMode, toggleNightMode } = useTheme();
  const { user, token, loading } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <header className="bg-white dark:bg-night-secondary shadow-sm border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm">
              &larr; Home
            </Link>
            <h1 className="text-2xl font-bold text-primary-700">Data Export</h1>
          </div>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/map" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Home</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading...</div>
        ) : !token || !user ? (
          <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Authentication Required</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">You need to log in to export data.</p>
            <Link
              href="/login"
              className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
            >
              Log In
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Export Sensor Data</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Select sensors, metrics, and a date range to download. Free plan: 1,000 rows/day. Pro: 100,000 rows/day. Enterprise: unlimited.
              </p>
            </div>
            <ExportPanel token={token} userPlan={user.plan ?? "free"} />
          </div>
        )}
      </main>
    </div>
  );
}

export default function ExportPage() {
  return (
    <AuthProvider>
      <ExportPageContent />
    </AuthProvider>
  );
}
