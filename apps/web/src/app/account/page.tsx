"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/PageState";
import { Badge, Button, Card, Input } from "@/components/ui";

const PLAN_FEATURES: Record<string, { label: string; price: string; features: string[] }> = {
  free: {
    label: "Free",
    price: "$0",
    features: ["Real-time sensor data", "Interactive map", "Citizen reports", "Email alerts"],
  },
  pro: {
    label: "Pro",
    price: "$29/mo",
    features: ["Everything in Free", "Historical data access", "Data export (CSV/JSON)", "API key management", "7-day data retention"],
  },
  enterprise: {
    label: "Enterprise",
    price: "$99/mo",
    features: ["Everything in Pro", "Unlimited data retention", "Priority support", "Custom integrations", "SLA guarantee"],
  },
};

const PLAN_ORDER = ["free", "pro", "enterprise"];

function AccountContent() {
  const { user, token, loading, refreshUser } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (loading) {
    return <PageLoader message="Loading account..." />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please <Link href="/login" className="text-primary-600">login</Link> to view your account.</p>
      </div>
    );
  }

  const currentPlan = user.plan || "free";
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);
  const isPaid = currentPlan === "pro" || currentPlan === "enterprise";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">You are currently on the <strong>{PLAN_FEATURES[currentPlan].label}</strong> plan.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLAN_ORDER.map((planKey) => {
              const plan = PLAN_FEATURES[planKey];
              const isCurrent = planKey === currentPlan;
              const isUpgrade = PLAN_ORDER.indexOf(planKey) > currentPlanIndex;
              const isDowngrade = PLAN_ORDER.indexOf(planKey) < currentPlanIndex;

              return (
                <Card key={planKey} className={isCurrent ? "border-primary-500" : ""}>
                  <h3 className="text-lg font-semibold">{plan.label}</h3>
                  <p className="text-3xl font-bold mt-2">{plan.price}</p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="text-sm text-gray-600 flex items-center gap-2 dark:text-gray-300">
                        <span className="text-green-500">&#10003;</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {isCurrent ? (
                      <Badge tone="info" className="w-full justify-center">Current Plan</Badge>
                    ) : isUpgrade ? (
                      <Button
                        className="w-full"
                        onClick={() => {
                          document.getElementById("coupon-section")?.scrollIntoView({ behavior: "smooth" });
                          document.getElementById("coupon-input")?.focus();
                        }}
                      >
                        Upgrade to {plan.label}
                      </Button>
                    ) : (
                      <Button className="w-full" variant="secondary" disabled>
                        Downgrade
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card id="coupon-section" className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Have a coupon?</h3>
            <p className="text-sm text-gray-600 mb-3 dark:text-gray-300">Enter your coupon code to upgrade your plan.</p>
            {couponMsg && (
              <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${
                couponMsg.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                  : "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
              }`}>
                {couponMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="coupon-input"
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
                disabled={applyingCoupon || isPaid}
                className="flex-1 uppercase"
              />
              <Button
                onClick={async () => {
                  if (!token || !couponCode.trim()) return;
                  setApplyingCoupon(true);
                  setCouponMsg(null);
                  try {
                    await api.auth.applyCoupon(couponCode.trim(), token);
                    setCouponMsg({ type: "success", text: "Coupon applied! You've been upgraded to Pro." });
                    setCouponCode("");
                    await refreshUser();
                  } catch (e: unknown) {
                    setCouponMsg({ type: "error", text: e instanceof Error ? e.message : "Invalid coupon code" });
                  }
                  setApplyingCoupon(false);
                }}
                disabled={applyingCoupon || !couponCode.trim() || isPaid}
              >
                {applyingCoupon ? "Applying..." : "Apply"}
              </Button>
            </div>
          </Card>
        </div>
        <Card>
          <h2 className="text-xl font-semibold mb-2">Developer API</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">API key management, public API docs, usage charts, and live testing are consolidated in the developer portal.</p>
          <Link href="/developer" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            Open Developer Portal
          </Link>
        </Card>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
