"use client";

import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useRouter } from 'next/navigation'
import { createVariable } from '@/lib/api/variables'
import { useQueryClient } from '@tanstack/react-query'

export function NewVariableForm() {
  const [type, setType] = useState<
    "String" | "Number" | "Boolean" | "Secret"
  >("String");
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [environment, setEnvironment] = useState('Production')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const router = useRouter()

  return (
    <div className="min-h-full bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link
          href="/variables"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Variables
        </Link>

        <span className="text-xs text-slate-400">
          New variable
        </span>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Add Variable
          </h1>

          <p className="mt-1.5 text-sm text-slate-500">
            Create a value that workflows can reference during execution.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-4">
            <Field label="Variable name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                placeholder="e.g. SUPPORT_CHANNEL"
                className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400"
              />
            </Field>

            <Field label="Type">
              <select
                value={type}
                onChange={(event) =>
                  setType(
                    event.target.value as
                      | "String"
                      | "Number"
                      | "Boolean"
                      | "Secret",
                  )
                }
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-400"
              >
                <option>String</option>
                <option>Number</option>
                <option>Boolean</option>
                <option>Secret</option>
              </select>
            </Field>

            <Field label="Environment">
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-400">
                <option>Production</option>
                <option>Staging</option>
                <option>Development</option>
              </select>
            </Field>

            <Field label="Value" required>
              {type === "Boolean" ? (
                <select value={value} onChange={(e) => setValue(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-400">
                  <option>true</option>
                  <option>false</option>
                </select>
              ) : (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  type={type === "Secret" ? "password" : "text"}
                  placeholder={
                    type === "Secret"
                      ? "Enter secret value"
                      : "Enter variable value"
                  }
                  className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400"
                />
              )}
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <Link
              href="/variables"
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Cancel
            </Link>

            <button
              type="button"
              onClick={async () => {
                setError(null)

                if (!name.trim()) {
                  setError('Name is required')
                  return
                }

                // Basic name validation: uppercase, numbers, underscore
                if (!/^[A-Z0-9_]+$/.test(name)) {
                  setError('Name must be uppercase letters, numbers or underscore')
                  return
                }

                if (type === 'Number' && isNaN(Number(value))) {
                  setError('Value must be a valid number')
                  return
                }

                try {
                  await createVariable({ name, value, type, environment })
                  queryClient.invalidateQueries({ queryKey: ['variables'] })
                  router.push('/variables')
                } catch (err) {
                  setError('Failed to create variable')
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Save className="h-3.5 w-3.5" />
              Save Variable
            </button>
            {error && <div className="mt-2 text-sm text-red-500">{error}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}


function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-slate-600">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500">*</span>
        )}
      </label>

      {children}
    </div>
  );
}