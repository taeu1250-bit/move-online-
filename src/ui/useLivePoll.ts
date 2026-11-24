import { useEffect } from 'react'
import { createLivePoll } from '../data/live'

export function useLivePoll(task: (current: () => boolean) => Promise<boolean | void>, interval: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const poll = createLivePoll(() => task(() => alive && !document.hidden && navigator.onLine), interval)
    const resume = () => document.hidden || !navigator.onLine ? poll.pause() : poll.resume()
    const pause = () => poll.pause()
    resume()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', pause)
    return () => {
      alive = false; poll.dispose()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', pause)
    }
  }, [task, interval, enabled])
}
