import { operationPolicy } from './operations.ts'

export function fromKoreanInput(value: string) {
  const ms = Date.parse(value + ':00+09:00')
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}
export function toKoreanInput(ms: number) {
  return Number.isFinite(ms) ? new Date(ms + 9 * 3600000).toISOString().slice(0, 16) : ''
}
// Keep the chosen duration when changing the start, including midnight and date changes.
export function shiftEndInput(previousStart: string, nextStart: string, end: string) {
  const start = Date.parse(fromKoreanInput(nextStart))
  if (!Number.isFinite(start)) return end
  const duration = Date.parse(fromKoreanInput(end)) - Date.parse(fromKoreanInput(previousStart))
  return toKoreanInput(start + (duration > 0 && duration <= operationPolicy.maxPlayHours * 3600000 ? duration : 2 * 3600000))
}
