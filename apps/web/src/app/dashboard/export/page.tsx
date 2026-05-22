"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { ExportPanel } from "@/components/ExportPanel";
import { PageLoader } from "@/components/PageState";

function ExportContent() {
  const { user, token, loading } = useAuth();
  const { nightMode, toggleNightMode } = useTheme();

  if (loading) {
    return <PageLoader message="Loading export tools..." />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p>
          Please <Link href="/login" className="text-primary-600">login</Link> to export data.
        </p>
      </div>
    );
  }

  const isPaid = user.plan === "pro" || user.plan === "enterprise";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-gray-700 transition"
              aria-label="Back to dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
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
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Map</Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
            <span className="text-sm text-gray-500">{user.full_name}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">Export Sensor Data</h2>
            <p className="text-sm text-gray-500">
              Select sensors, metrics, and time range to download data for analysis.
              {!isPaid && (
                <span className="block mt-1 text-amber-600">
                  <Link href="/account" className="underline">Upgrade to Pro</Link> for raw granularity and Parquet format.
                </span>
              )}
            </p>
          </div>
          <ExportPanel token={token!} userPlan={user.plan} />
        </div>

        <div className="text-xs text-gray-400 text-center">
          Exports are rate-limited to 10 per hour. Historical data is retained for 90 days.
        </div>
      </main>
    </div>
  );
}

export default function ExportPage() {
  return <ExportContent />;
}
