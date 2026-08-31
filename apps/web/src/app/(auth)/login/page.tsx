'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { useLogin, useSession, useSignup } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api/client'

type Mode = 'login' | 'signup'

function LoginView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'

  const session = useSession()
  const loginMutation = useLogin()
  const signupMutation = useSignup()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')

  // Already authenticated (verified via /auth/me, not just cookie presence).
  useEffect(() => {
    if (session.data?.user) {
      router.replace(next)
    }
  }, [session.data, next, router])

  const busy = loginMutation.isPending || signupMutation.isPending
  const apiError =
    (loginMutation.error instanceof ApiError && loginMutation.error.message) ||
    (signupMutation.error instanceof ApiError && signupMutation.error.message) ||
    (loginMutation.error || signupMutation.error ? 'Something went wrong.' : '')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')

    if (!email.trim() || !password) {
      setFormError('Email and password are required.')
      return
    }
    if (mode === 'signup' && password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }

    try {
      if (mode === 'login') {
        await loginMutation.mutateAsync({ email: email.trim(), password })
      } else {
        await signupMutation.mutateAsync({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        })
      }
      router.replace(next)
    } catch {
      // Surfaced via `apiError`.
    }
  }

  const inputClass =
    'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400'

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">
        {mode === 'login' ? 'Sign in' : 'Create your account'}
      </h1>
      <p className="mt-1 text-xs text-slate-500">
        {mode === 'login'
          ? 'Sign in to AI Workflow Studio.'
          : 'Sign up and we’ll create your workspace.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        {mode === 'signup' && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">Name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={busy}
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500">Email</label>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={busy}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500">
            Password
          </label>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            disabled={busy}
          />
        </div>

        {(formError || apiError) && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {formError || apiError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setFormError('')
          loginMutation.reset()
          signupMutation.reset()
        }}
        className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-700"
        disabled={busy}
      >
        {mode === 'login'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      }
    >
      <LoginView />
    </Suspense>
  )
}
