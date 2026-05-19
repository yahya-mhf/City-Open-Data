"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface Report {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
}

function ReportsList() {
  const { user, token } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.reports
      .my(token)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please <Link href="/login" className="text-primary-600">login</Link> to view reports.</p>
      </div>
    );
  }

  const statusDisplay: Record<string, string> = {
    pending: "Pending",
    under_review: "Under Review",
    in_progress: "In Progress",
    resolved: "Resolved",
    rejected: "Rejected",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    under_review: "bg-blue-100 text-blue-800",
    in_progress: "bg-indigo-100 text-indigo-800",
    resolved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">My Reports</h1>
          <div className="flex gap-4">
            <Link href="/reports/new" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
              New Report
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-gray-500 text-center">Loading...</p>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No reports yet</p>
            <Link href="/reports/new" className="text-primary-600 hover:underline">Submit your first report</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">{report.category.replace(/_/g, " ")}</h3>
                    <p className="text-gray-600 text-sm mt-1">{report.description.slice(0, 200)}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}</span>
                      {report.image_url && <span>Has photo</span>}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ml-4 ${statusColors[report.status] || "bg-gray-100"}`}>
                    {statusDisplay[report.status] || report.status}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-3">
                  {new Date(report.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AuthProvider>
      <ReportsList />
    </AuthProvider>
  );
}
