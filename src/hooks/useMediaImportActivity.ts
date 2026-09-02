import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

const active = new Set<symbol>()
const listeners = new Set<() => void>()
function notify() { for (const listener of listeners) listener() }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function hasPendingMediaImports(): boolean { return active.size > 0 }
export function useMediaImportsBusy(): boolean { return useSyncExternalStore(subscribe, hasPendingMediaImports, () => false) }

/** Tracks the complete processor → storage → draft commit, not just decoding.
 * A context change/unmount cancels its participation after the caller has
 * invalidated obsolete upload completions. Releases are idempotent.
 */
export function useMediaImportTracker(context?: string): () => () => void {
  const owned = useRef(new Set<() => void>())
  useEffect(() => {
    const operations = owned.current
    return () => { for (const finish of operations) finish() }
  }, [context])
  return useCallback(() => {
    const token = Symbol('media-import')
    const finish = () => {
      owned.current.delete(finish)
      if (active.delete(token)) notify()
    }
    owned.current.add(finish)
    active.add(token)
    notify()
    return finish
  }, [])
}
