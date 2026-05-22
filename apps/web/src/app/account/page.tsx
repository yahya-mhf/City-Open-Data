"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EmptyState, PageLoader } from "@/components/PageState";
import { Badge, Button, Card, Input } from "@/components/ui";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit: number;
  is_active: boolean;
  created_at: string;
}

interface NewApiKey {
  id: string;
  name: string;
  key: string;
  rate_limit: number;
  created_at: string;
}

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
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState<NewApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api.apiKeys.list(token).then(setApiKeys).catch((err) => setError(err instanceof Error ? err.message : "Failed to load API keys"));
  }, [token]);

  const createKey = async () => {
    if (!token || !keyName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const key = await api.apiKeys.create(keyName.trim(), token);
      setNewKey(key);
      setKeyName("");
      setApiKeys((prev) => [...prev, { id: key.id, name: key.name, key_prefix: key.key.slice(0, 8), rate_limit: key.rate_limit, is_active: true, created_at: key.created_at }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    }
    setCreating(false);
  };

  const deleteKey = async (id: string) => {
    if (!token) return;
    try {
      await api.apiKeys.delete(id, token);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete API key");
    }
  };

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
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">You are currently on the <strong>{PLAN_FEATURES[currentPlan].label}</strong> plan.</p>

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
                      <li key={f} className="text-sm text-gray-600 flex items-center gap-2 dark:text-gray-400">
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
            <p className="text-sm text-gray-600 mb-3 dark:text-gray-400">Enter your coupon code to upgrade your plan.</p>
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
          <h2 className="text-xl font-semibold mb-4">API Keys</h2>

          {!isPaid && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-sm text-yellow-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
              API key management is available on Pro and Enterprise plans.
            </div>
          )}

          {newKey && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 dark:bg-blue-900/20 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">API Key Created</p>
              <p className="text-sm text-blue-700 mt-1 dark:text-blue-300">Make sure to copy your key now. You won&apos;t be able to see it again.</p>
              <div className="mt-2 rounded-lg border bg-white p-2 font-mono text-sm break-all select-all dark:border-night-border dark:bg-night-primary">{newKey.key}</div>
              <button onClick={() => { setNewKey(null); navigator.clipboard?.writeText(newKey.key); }} className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300">
                Copied! Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{error}</div>
          )}

          <div className="flex gap-2 mb-6">
            <Input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g. My App)"
              disabled={!isPaid || creating}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
            <Button
              onClick={createKey}
              disabled={!isPaid || creating || !keyName.trim()}
            >
              {creating ? "Creating..." : "Create Key"}
            </Button>
          </div>

          {apiKeys.length === 0 ? (
            <EmptyState message="Create an API key from a paid plan to access public Urban Pulse endpoints." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Key Prefix</th>
                  <th className="pb-2 font-medium">Rate Limit</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} className="border-b">
                    <td className="py-2">{k.name}</td>
                    <td className="py-2 font-mono text-xs">{k.key_prefix}...</td>
                    <td className="py-2">{k.rate_limit}/min</td>
                    <td className="py-2">
                      <Badge tone={k.is_active ? "success" : "danger"}>{k.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="py-2">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Button variant="ghost" size="sm" onClick={() => deleteKey(k.id)} className="text-red-600 dark:text-red-400">Revoke</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
