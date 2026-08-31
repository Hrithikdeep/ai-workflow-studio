'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

import NewWorkflowForm from '@/components/workflows/new-workflow-form'
import { useCreateWorkflow } from '@/hooks/use-workflows'

export default function NewWorkflowPage() {
  const router = useRouter()
  const createWorkflowMutation = useCreateWorkflow()

  const handleCreateWorkflow = async ({
    name,
    description,
  }: {
    name: string
    description: string
  }) => {
    const trimmedName = name.trim()

    if (!trimmedName) {
      return
    }

    try {
      const createdWorkflow = await createWorkflowMutation.mutateAsync({
        name: trimmedName,
        description: description.trim() || undefined,
      })

      // A new workflow starts blank — the backend creates an empty version 1
      // graph, which the editor opens.
      router.push(`/workflows/${createdWorkflow.id}`)
    } catch (error) {
      console.error('[Relay] Failed to create workflow:', error)
      alert('Unable to create workflow.')
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Create Workflow
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              Design and launch a new automation workflow.
            </p>
          </div>

          <Link
            href="/workflows"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      </div>

      <main className="px-7 py-6">
        <NewWorkflowForm
          open
          onClose={() => router.push('/workflows')}
          onCreate={handleCreateWorkflow}
        />
      </main>
    </div>
  )
}
