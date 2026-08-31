"use client";

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { getVariable, updateVariable } from '@/lib/api/variables';
import { useQueryClient } from '@tanstack/react-query';

export default function EditVariablePage() {
  const params = useParams() as { id?: string };
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'String'|'Number'|'Boolean'|'Secret'>('String');
  const [environment, setEnvironment] = useState('Production');

  useEffect(() => {
    if (!id) return;

    let mounted = true;

    getVariable(id).then((v) => {
      if (!mounted) return;
      setName(v.name);
      setType(v.type as any);
      setEnvironment(v.environment ?? 'Production');
      setValue(v.value ?? '');
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setError('Failed to load variable');
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [id]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/variables" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Back to Variables
        </Link>

        <span className="text-xs text-slate-400">Edit variable</span>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {loading && <div>Loading...</div>}
        {error && <div className="text-red-500">{error}</div>}

        {!loading && !error && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Variable name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} type="text" className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-[11px] text-slate-700" />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Type</label>
                <select value={type} onChange={(e) => setType(e.target.value as any)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700">
                  <option>String</option>
                  <option>Number</option>
                  <option>Boolean</option>
                  <option>Secret</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Environment</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700">
                  <option>Production</option>
                  <option>Staging</option>
                  <option>Development</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Value</label>
                {type === 'Boolean' ? (
                  <select value={value} onChange={(e) => setValue(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700">
                    <option>true</option>
                    <option>false</option>
                  </select>
                ) : (
                  <input value={value} onChange={(e) => setValue(e.target.value)} type={type === 'Secret' ? 'password' : 'text'} className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-[11px] text-slate-700" />
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <Link href="/variables" className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</Link>

              <button
                type="button"
                onClick={async () => {
                  if (!id) return;
                  if (!name.trim()) return;

                  try {
                    await updateVariable(id, { name, value, type, environment });
                    queryClient.invalidateQueries({ queryKey: ['variables'] });
                    router.push('/variables');
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to save variable', err);
                  }
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Save className="h-3.5 w-3.5" />
                Save Variable
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
