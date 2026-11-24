/** One request at a time; visibility changes and manual refreshes never overlap reads. */
export function createLivePoll(task: () => Promise<boolean | void>, interval: number,
  clock = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) }) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false, disposed = false, queued = false
  let flight: Promise<void> | null = null
  let errors = 0, idle = 0
  const clear = () => { if (timer !== undefined) clock.clear(timer); timer = undefined }
  const run = (): Promise<void> => {
    clear()
    if (!active || disposed) return Promise.resolve()
    if (flight) { queued = true; return flight }
    flight = (async () => {
      try { const changed = await task(); errors = 0; idle = changed === false ? Math.min(idle + 1, 4) : 0 }
      catch { errors = Math.min(errors + 1, 4) }
      finally {
        flight = null
        if (active && !disposed) {
          const delay = queued ? 0 : errors ? Math.min(30_000, interval * 2 ** errors) : interval * (1 + idle)
          queued = false
          timer = clock.set(() => { void run() }, delay)
        }
      }
    })()
    return flight
  }
  return {
    refresh: run,
    resume(immediate = true) { if (disposed) return; active = true; if (immediate) void run(); else { clear(); timer = clock.set(() => { void run() }, interval) } },
    pause() { active = false; queued = false; clear() },
    dispose() { disposed = true; active = false; queued = false; clear() },
  }
}
