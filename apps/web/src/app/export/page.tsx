"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ExportPanel } from "@/components/ExportPanel";
import { PageLoader } from "@/components/PageState";
import { Card } from "@/components/ui";

function ExportPageContent() {
  const { user, token, loading } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <PageLoader message="Loading export tools..." />
        ) : !token || !user ? (
          <Card className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Authentication Required</h2>
            <p className="text-gray-500 dark:text-gray-300 mb-6">You need to log in to export data.</p>
            <Link
              href="/login"
              className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
            >
              Log In
            </Link>
          </Card>
        ) : (
          <Card>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Export Sensor Data</h1>
               <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                Free: hourly/daily CSV, JSON, and GeoJSON with 1,000 rows/day. Pro: raw, 1-minute, Parquet, and 100,000 rows/day. Enterprise: high-volume exports.
              </p>
            </div>
            <ExportPanel token={token} userPlan={user.plan ?? "free"} />
          </Card>
        )}
      </main>
    </div>
  );
}

export default function ExportPage() {
  return <ExportPageContent />;
}
