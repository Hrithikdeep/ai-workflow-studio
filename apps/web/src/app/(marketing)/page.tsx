import type { Metadata } from "next";

import {
  ArchitectureSection,
  CapabilitiesSection,
  HeroSection,
  HowItWorks,
  LandingFooter,
  LandingHeader,
} from "@/components/landing";

export const metadata: Metadata = {
  title: "AI Workflow Studio — backend automation you can actually debug",
  description:
    "Wire webhooks, AI agents, HTTP requests and databases together on a visual canvas. Test each node in isolation, run the whole flow, and inspect every payload.",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <LandingHeader />

      <main className="flex-1">
        <HeroSection />
        <HowItWorks />
        <ArchitectureSection />
        <CapabilitiesSection />
      </main>

      <LandingFooter />
    </div>
  );
}
