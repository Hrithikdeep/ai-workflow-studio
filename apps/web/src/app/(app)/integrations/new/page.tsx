import Link from "next/link";
import { NewIntegrationForm } from "@/components/integrations/new-integration-form";
import { ChevronLeft } from "lucide-react";

export default function NewIntegrationPage() {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Add Integration</h1>

            <p className="mt-1 text-xs text-slate-500">Connect an external service to use in your workflows.</p>
          </div>

          <Link href="/integrations" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700">
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </div>

      <main className="px-7 py-6">
        <NewIntegrationForm />
      </main>
    </div>
  );
}
