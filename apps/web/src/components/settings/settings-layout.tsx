"use client";

import Link from "next/link";
import {
  Bell,
  Code2,
  LockKeyhole,
  Settings2,
  UserRound,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

const SETTINGS_ITEMS = [
  {
    href: "/settings",
    label: "General",
    description: "Workspace preferences",
    icon: Settings2,
  },
  {
    href: "/settings/members",
    label: "Members",
    description: "People and access",
    icon: Users,
  },
  {
    href: "/settings/security",
    label: "Security",
    description: "Authentication and access",
    icon: LockKeyhole,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Alerts and preferences",
    icon: Bell,
  },
  {
    href: "/settings/api",
    label: "API & Developer",
    description: "Keys and developer tools",
    icon: Code2,
  },
];

export function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>

        <p className="mt-1 text-xs text-slate-500">
          Manage your workspace, members, security, and developer preferences.
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-7 py-5 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-[220px]">
          <nav className="rounded-xl border border-slate-200 bg-white p-2">
            {SETTINGS_ITEMS.map((item) => {
              const Icon = item.icon;

              const active =
                item.href === "/settings"
                  ? pathname === "/settings" ||
                    pathname === "/settings/general"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      active
                        ? "bg-white text-slate-700 shadow-sm"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold">
                      {item.label}
                    </span>

                    <span className="mt-0.5 block truncate text-[8px] text-slate-400">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main settings panel */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}