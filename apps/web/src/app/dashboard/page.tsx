"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { PageError, PageLoader } from "@/components/PageState";
import { Card } from "@/components/ui";

function DashboardContent() {
  const { user, token, loading } = useAuth();
  const [sensorCount, setSensorCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setError(null);
    Promise.all([
      api.sensors.list(token),
      api.alerts.list(token, false),
      api.reports.my(token),
    ])
      .then(([sensors, alerts, reports]) => {
        setSensorCount(sensors.length);
        setAlertCount(alerts.length);
        setReportCount(reports.length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard data"));
  }, [token]);

  if (loading) {
    return <PageLoader message="Loading dashboard..." />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please <Link href="/login" className="text-primary-600">login</Link> to view dashboard.</p>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const isOperator = user.role === "operator" || isAdmin;

  if (error) {
    return <PageError message={error} retry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Overview for {user.full_name}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <h3 className="text-gray-500 text-sm font-medium uppercase">Active Sensors</h3>
            <p className="text-3xl font-bold mt-2">{sensorCount}</p>
          </Card>
          <Card>
            <h3 className="text-gray-500 text-sm font-medium uppercase">Active Alerts</h3>
            <p className="text-3xl font-bold mt-2 text-red-600">{alertCount}</p>
          </Card>
          <Card>
            <h3 className="text-gray-500 text-sm font-medium uppercase">My Reports</h3>
            <p className="text-3xl font-bold mt-2">{reportCount}</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/map" className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-night-border dark:bg-night-secondary">
            <h3 className="text-lg font-semibold">View Map</h3>
            <p className="text-gray-600 mt-2 dark:text-gray-400">See all sensors on an interactive map</p>
          </Link>
          <Link href="/reports/new" className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-night-border dark:bg-night-secondary">
            <h3 className="text-lg font-semibold">Submit Report</h3>
            <p className="text-gray-600 mt-2 dark:text-gray-400">Report an issue in your city</p>
          </Link>
          <Link href="/reports" className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-night-border dark:bg-night-secondary">
            <h3 className="text-lg font-semibold">My Reports</h3>
            <p className="text-gray-600 mt-2 dark:text-gray-400">Track your submitted reports</p>
          </Link>
          <Link href="/dashboard/export" className="block rounded-lg border border-l-4 border-gray-200 border-l-green-500 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-night-border dark:border-l-green-500 dark:bg-night-secondary">
            <h3 className="text-lg font-semibold">Data Export</h3>
            <p className="text-gray-600 mt-2 dark:text-gray-400">Download sensor data as CSV, JSON, or Parquet</p>
          </Link>
          {isOperator && (
            <Link href="/admin" className="block rounded-lg border border-l-4 border-gray-200 border-l-primary-500 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-night-border dark:border-l-primary-500 dark:bg-night-secondary">
              <h3 className="text-lg font-semibold">Admin Panel</h3>
              <p className="text-gray-600 mt-2 dark:text-gray-400">Manage sensors, users, and reports</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
