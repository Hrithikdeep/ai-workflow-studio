"use client";

import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronDown,
  CircleHelp,
  Code2,
  ExternalLink,
  FileText,
  Headphones,
  Search,
  Settings2,
  Workflow,
  Zap,
} from "lucide-react";

import { useState } from "react";

const QUICK_LINKS = [
  {
    title: "Getting Started",
    description:
      "Learn the basics and create your first workflow.",
    icon: Zap,
  },
  {
    title: "Workflow Builder",
    description:
      "Understand nodes, branches, triggers, and workflow design.",
    icon: Workflow,
  },
  {
    title: "Executions",
    description:
      "Monitor runs, inspect traces, and troubleshoot failures.",
    icon: Bot,
  },
  {
    title: "Integrations",
    description:
      "Connect services and configure credentials.",
    icon: Settings2,
  },
  {
    title: "API & Developer",
    description:
      "Build integrations using the AI Workflow Studio API.",
    icon: Code2,
  },
];

const GUIDES = [
  {
    title: "Build your first workflow",
    description:
      "Create a trigger, add actions, connect nodes, and publish your workflow.",
    readTime: "5 min read",
  },
  {
    title: "Understanding workflow executions",
    description:
      "Learn how AI Workflow Studio executes nodes, handles failures, and records traces.",
    readTime: "7 min read",
  },
  {
    title: "Configure an integration",
    description:
      "Connect Slack, Gmail, PostgreSQL, and external APIs.",
    readTime: "4 min read",
  },
  {
    title: "Working with variables",
    description:
      "Use workspace variables and secrets inside workflow nodes.",
    readTime: "4 min read",
  },
];

const FAQS = [
  {
    question: "How do I create a workflow?",
    answer:
      "Open Workflows, select Create Workflow, choose a starting trigger, and continue to the workflow editor.",
  },
  {
    question: "How can I debug a failed execution?",
    answer:
      "Open Executions, select the failed run, and inspect the execution timeline, inputs, outputs, and trace details.",
  },
  {
    question: "Where are integration credentials stored?",
    answer:
      "Integration credentials are managed from the Integrations section and are intended to remain hidden from workflow output.",
  },
  {
    question: "Can workflows use environment variables?",
    answer:
      "Yes. Variables can be managed from the Variables section and referenced from workflow nodes.",
  },
];

export function HelpCenter() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-7 py-7">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
                <BookOpen className="h-5 w-5" />
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Help Center
              </h1>

              <p className="mt-1 text-xs text-slate-500">
                Guides, documentation, and answers for building with AI Workflow Studio.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Headphones className="h-3.5 w-3.5" />
              Contact support
            </button>
          </div>

          {/* Search */}
          <div className="mt-6 flex h-11 max-w-2xl items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />

            <input
              type="text"
              placeholder="Search guides, documentation, and FAQs..."
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />

            <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] text-slate-400 sm:inline">
              /
            </kbd>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-7 py-6">
        {/* Quick links */}
        <section>
          <div className="mb-3">
            <h2 className="text-xs font-semibold text-slate-800">
              Explore AI Workflow Studio
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Start with the area you need help with.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.title}
                  type="button"
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-600">
                    <Icon className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-slate-800">
                      {item.title}
                    </span>

                    <span className="mt-1 block text-[9px] leading-4 text-slate-400">
                      {item.description}
                    </span>
                  </span>

                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Guides + FAQ */}
        <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Guides */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xs font-semibold text-slate-800">
                  Popular guides
                </h2>

                <p className="mt-1 text-[9px] text-slate-400">
                  Practical walkthroughs for common tasks.
                </p>
              </div>

              <BookOpen className="h-4 w-4 text-slate-300" />
            </div>

            <div className="divide-y divide-slate-100">
              {GUIDES.map((guide) => (
                <GuideRow
                  key={guide.title}
                  title={guide.title}
                  description={guide.description}
                  readTime={guide.readTime}
                />
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xs font-semibold text-slate-800">
                  Frequently asked questions
                </h2>

                <p className="mt-1 text-[9px] text-slate-400">
                  Quick answers to common questions.
                </p>
              </div>

              <CircleHelp className="h-4 w-4 text-slate-300" />
            </div>

            <div className="divide-y divide-slate-100">
              {FAQS.map((faq, index) => {
                const open = openFaq === index;

                return (
                  <div key={faq.question}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFaq(
                          open ? null : index,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
                    >
                      <span className="text-[10px] font-medium text-slate-700">
                        {faq.question}
                      </span>

                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {open && (
                      <div className="px-5 pb-4">
                        <p className="text-[9px] leading-4 text-slate-400">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Documentation / support */}
        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <SupportCard
            icon={<FileText />}
            title="Documentation"
            description="Browse the complete AI Workflow Studio product and API documentation."
            action="Open documentation"
          />

          <SupportCard
            icon={<Headphones />}
            title="Need more help?"
            description="Contact the AI Workflow Studio team for assistance with your workspace."
            action="Contact support"
          />
        </section>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Guide row                                                                   */
/* -------------------------------------------------------------------------- */

function GuideRow({
  title,
  description,
  readTime,
}: {
  title: string;
  description: string;
  readTime: string;
}) {
  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50/70"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
        <FileText className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold text-slate-700 group-hover:text-blue-600">
          {title}
        </span>

        <span className="mt-1 block text-[9px] leading-4 text-slate-400">
          {description}
        </span>

        <span className="mt-1.5 block text-[8px] text-slate-300">
          {readTime}
        </span>
      </span>

      <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Support card                                                                */
/* -------------------------------------------------------------------------- */

function SupportCard({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-slate-800">
          {title}
        </span>

        <span className="mt-1 block text-[9px] leading-4 text-slate-400">
          {description}
        </span>
      </span>

      <span className="shrink-0 text-[9px] font-semibold text-blue-600">
        {action}
      </span>
    </button>
  );
}