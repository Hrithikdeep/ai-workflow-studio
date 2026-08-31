"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Workflow, X } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Architecture", href: "#architecture" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Docs", href: "#" },
];

/** Small blue product mark. Reused in the footer. */
export function LandingLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white",
        className,
      )}
      aria-hidden="true"
    >
      <Workflow className="h-4 w-4" />
    </span>
  );
}

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-slate-900"
          >
            <LandingLogo />
            AI Workflow Studio
          </Link>

          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-600 transition-colors hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <nav
            className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-6 py-3"
            aria-label="Primary mobile"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-3">
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Get started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
