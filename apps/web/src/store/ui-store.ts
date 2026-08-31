'use client'

import { useCallback, useSyncExternalStore } from 'react'

const SIDEBAR_COLLAPSED_KEY = 'awf-sidebar-collapsed'

/**
 * Persisted app-shell UI preferences.
 *
 * Kept intentionally small — just the sidebar collapse preference for now.
 * `localStorage` is the source of truth; `useSyncExternalStore` gives an
 * SSR-safe read (server + first client render agree on `false`) and keeps
 * the preference in sync across navigations, refreshes and browser tabs.
 */

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_COLLAPSED_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function getServerSnapshot(): boolean {
  return false
}

function setCollapsedPreference(next: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
  } catch {
    // ignore (private mode / storage disabled)
  }
  listeners.forEach((notify) => notify())
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const toggle = useCallback(() => {
    setCollapsedPreference(!getSnapshot())
  }, [])

  const setSidebarCollapsed = useCallback((next: boolean) => {
    setCollapsedPreference(next)
  }, [])

  return { collapsed, toggle, setSidebarCollapsed }
}
