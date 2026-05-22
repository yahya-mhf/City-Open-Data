"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import SeismicAlertWrapper from "@/components/SeismicAlertWrapper";
import ChatWrapper from "@/components/chatbot/ChatWrapper";

interface AppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/map", label: "Map" },
  { href: "/maps", label: "Layers" },
  { href: "/reports", label: "Reports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/export", label: "Export" },
  { href: "/developer", label: "Developer" },
  { href: "/account", label: "Account" },
  { href: "/admin", label: "Admin", roles: ["operator", "admin"] },
];

const PUBLIC_AUTH_PATHS = new Set(["/login", "/register"]);

function labelFromSegment(segment: string): string {
  return segment
    .replace(/\[|\]/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { nightMode, toggleNightMode, demoMode, toggleDemoMode } = useTheme();

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
    [user],
  );

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const crumbs = [{ href: "/", label: "Home" }];
    parts.forEach((part, index) => {
      crumbs.push({
        href: `/${parts.slice(0, index + 1).join("/")}`,
        label: labelFromSegment(part),
      });
    });
    return crumbs;
  }, [pathname]);

  const isAuthPath = PUBLIC_AUTH_PATHS.has(pathname);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-night-primary dark:text-gray-100">
      <header className="sticky top-0 z-[2500] border-b border-gray-200 bg-white/85 backdrop-blur-md dark:border-night-border dark:bg-night-secondary/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-primary-700 dark:text-brand-500">
              Urban Pulse
            </Link>
            {!isAuthPath && (
              <nav className="hidden items-center gap-3 lg:flex">
                {visibleItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "text-gray-600 hover:bg-gray-100 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-night-border"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleDemoMode}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                demoMode
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-night-border dark:text-gray-300"
              }`}
            >
              {demoMode ? "Demo On" : "Demo"}
            </button>
            <button
              onClick={toggleNightMode}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-night-border"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "Day" : "Night"}
            </button>
            {loading ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : user ? (
              <>
                <span className="hidden text-sm text-gray-500 dark:text-gray-400 md:inline">
                  {user.full_name}
                </span>
                <button
                  onClick={() => logout()}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/30">
                  Login
                </Link>
                <Link href="/register" className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
        {!isAuthPath && breadcrumbs.length > 1 && (
          <div className="mx-auto hidden max-w-7xl items-center gap-2 px-4 pb-2 text-xs text-gray-400 md:flex">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.href} className="flex items-center gap-2">
                {index > 0 && <span>/</span>}
                {index === breadcrumbs.length - 1 ? (
                  <span className="text-gray-600 dark:text-gray-300">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="hover:text-primary-600">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="[&>div>header]:hidden">{children}</main>
      <SeismicAlertWrapper />
      <ChatWrapper />
    </div>
  );
}
