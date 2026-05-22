"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/PageState";

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
  const { nightMode, toggleNightMode } = useTheme();
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Account</h1>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Map</Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
            <span className="text-sm text-gray-500">{user.full_name}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Subscription Plan</h2>
          <p className="text-gray-600 mb-4">You are currently on the <strong>{PLAN_FEATURES[currentPlan].label}</strong> plan.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLAN_ORDER.map((planKey) => {
              const plan = PLAN_FEATURES[planKey];
              const isCurrent = planKey === currentPlan;
              const isUpgrade = PLAN_ORDER.indexOf(planKey) > currentPlanIndex;
              const isDowngrade = PLAN_ORDER.indexOf(planKey) < currentPlanIndex;

              return (
                <div key={planKey} className={`bg-white rounded-xl shadow p-6 border-2 ${isCurrent ? "border-primary-500" : "border-transparent"}`}>
                  <h3 className="text-lg font-semibold">{plan.label}</h3>
                  <p className="text-3xl font-bold mt-2">{plan.price}</p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="text-green-500">&#10003;</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {isCurrent ? (
                      <span className="block text-center text-sm text-primary-600 font-medium">Current Plan</span>
                    ) : isUpgrade ? (
                      <button
                        onClick={() => {
                          document.getElementById("coupon-section")?.scrollIntoView({ behavior: "smooth" });
                          document.getElementById("coupon-input")?.focus();
                        }}
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
                      >
                        Upgrade to {plan.label}
                      </button>
                    ) : (
                      <button className="w-full px-4 py-2 border border-gray-300 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed" disabled>
                        Downgrade
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div id="coupon-section" className="mt-6 bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Have a coupon?</h3>
            <p className="text-sm text-gray-600 mb-3">Enter your coupon code to upgrade your plan.</p>
            {couponMsg && (
              <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${
                couponMsg.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {couponMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <input
                id="coupon-input"
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
                disabled={applyingCoupon || isPaid}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
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
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {applyingCoupon ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-semibold mb-4">API Keys</h2>

          {!isPaid && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-sm text-yellow-800">
              API key management is available on Pro and Enterprise plans.
            </div>
          )}

          {newKey && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-blue-800">API Key Created</p>
              <p className="text-sm text-blue-700 mt-1">Make sure to copy your key now — you won&apos;t be able to see it again.</p>
              <div className="mt-2 bg-white border rounded p-2 font-mono text-sm break-all select-all">{newKey.key}</div>
              <button onClick={() => { setNewKey(null); navigator.clipboard?.writeText(newKey.key); }} className="mt-2 text-xs text-blue-600 hover:text-blue-800">
                Copied! Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g. My App)"
              disabled={!isPaid || creating}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
            <button
              onClick={createKey}
              disabled={!isPaid || creating || !keyName.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Key"}
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <p className="text-gray-500 text-sm">No API keys yet.</p>
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${k.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {k.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <button onClick={() => deleteKey(k.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
