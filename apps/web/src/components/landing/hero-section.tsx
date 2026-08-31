import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { WorkflowPreview } from "./workflow-preview";

export function HeroSection() {
  return (
    <section className="border-b border-slate-200">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            v2.4 — agent traces are live
          </span>

          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            Backend automation you can actually debug.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
            Wire webhooks, AI agents, HTTP requests and databases together on a
            visual canvas. Test each node in isolation, run the whole flow, and
            inspect every payload the system produced.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Open the studio
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Read the docs
            </a>
          </div>

          <p className="mt-6 font-mono text-xs text-slate-400">
            No credit card · 142 runs included on the free tier
          </p>
        </div>

        <div className="lg:pl-4">
          <WorkflowPreview />
        </div>
      </div>
    </section>
  );
}
