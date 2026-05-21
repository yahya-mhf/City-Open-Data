"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";

function DashboardContent() {
  const { user, token, loading } = useAuth();
  const { nightMode, toggleNightMode } = useTheme();
  const [sensorCount, setSensorCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    api.sensors.list(token).then((s) => setSensorCount(s.length)).catch(() => {});
    api.alerts.list(token, false).then((a) => setAlertCount(a.length)).catch(() => {});
    api.reports.my(token).then((r) => setReportCount(r.length)).catch(() => {});
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Dashboard</h1>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Map</Link>
            <Link href="/maps/future" className="text-gray-600 hover:text-primary-600">Future City</Link>
            <Link href="/maps" className="text-gray-600 hover:text-primary-600">Maps</Link>
            <Link href="/account" className="text-gray-600 hover:text-primary-600">Account</Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
            {isOperator && <Link href="/admin" className="text-gray-600 hover:text-primary-600">Admin</Link>}
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
            <span className="text-sm text-gray-500">{user.full_name}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium uppercase">Active Sensors</h3>
            <p className="text-3xl font-bold mt-2">{sensorCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium uppercase">Active Alerts</h3>
            <p className="text-3xl font-bold mt-2 text-red-600">{alertCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium uppercase">My Reports</h3>
            <p className="text-3xl font-bold mt-2">{reportCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/map" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition">
            <h3 className="text-lg font-semibold">View Map</h3>
            <p className="text-gray-600 mt-2">See all sensors on an interactive map</p>
          </Link>
          <Link href="/reports/new" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition">
            <h3 className="text-lg font-semibold">Submit Report</h3>
            <p className="text-gray-600 mt-2">Report an issue in your city</p>
          </Link>
          <Link href="/reports" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition">
            <h3 className="text-lg font-semibold">My Reports</h3>
            <p className="text-gray-600 mt-2">Track your submitted reports</p>
          </Link>
          <Link href="/dashboard/export" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition border-l-4 border-green-500">
            <h3 className="text-lg font-semibold">Data Export</h3>
            <p className="text-gray-600 mt-2">Download sensor data as CSV, JSON, or Parquet</p>
          </Link>
          {isOperator && (
            <Link href="/admin" className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition border-l-4 border-primary-500">
              <h3 className="text-lg font-semibold">Admin Panel</h3>
              <p className="text-gray-600 mt-2">Manage sensors, users, and reports</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
