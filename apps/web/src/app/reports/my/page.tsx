"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import { Badge, Card } from "@/components/ui";

interface ReportItem {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
}

const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-gray-100 text-sm text-gray-400 dark:bg-night-secondary">Loading map...</div>,
});

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "default" {
  if (status === "resolved") return "success";
  if (status === "in_progress" || status === "under_review") return "warning";
  if (status === "rejected") return "danger";
  if (status === "pending") return "info";
  return "default";
}

const TIMELINE = ["pending", "in_progress", "resolved"];

export default function MyReportsPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setReports(await api.reports.my(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && token) loadReports();
    if (!authLoading && !token) setLoading(false);
  }, [authLoading, token]);

  if (authLoading || loading) return <PageLoader message="Loading your reports..." />;

  if (!user || !token) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Login required</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">You need to log in to view your reports.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Login</Link>
        </Card>
      </div>
    );
  }

  if (error) return <PageError message={error} retry={loadReports} />;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Reports</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">Track your submitted reports, status changes, and locations.</p>
        </Card>

        {reports.length === 0 ? (
          <EmptyState message="You have not submitted any reports yet." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
            <div className="space-y-4">
              {reports.map((report) => {
                const currentIndex = Math.max(0, TIMELINE.indexOf(report.status));
                return (
                  <Card key={report.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{report.category.replace(/_/g, " ")}</h2>
                          <Badge tone={statusTone(report.status)}>{report.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{report.description}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">{new Date(report.created_at).toLocaleString()} · {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {TIMELINE.map((step, index) => (
                        <div key={step} className={`rounded-lg px-3 py-2 text-center text-xs font-medium ${index <= currentIndex ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300" : "bg-gray-100 text-gray-400 dark:bg-night-border dark:text-gray-500"}`}>
                          {step.replace(/_/g, " ")}
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
            <Card className="h-[32rem] overflow-hidden p-0">
              <ReportsMap reports={reports} />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
