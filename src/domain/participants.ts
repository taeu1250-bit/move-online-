import type { Data, Match } from './model.ts'
import { confirmed, seats } from './model.ts'

// Deduplicate by account, not display name. Do not infer hidden names from another roster.
export function participantPreview(data: Data, match: Match) {
  const total = seats(data, match)
  const known = new Map<string, string>()
  const host = data.users.find(p => p.id === match.hostId)
  const hostState = match.operations?.participants.find(p => p.userId === match.hostId)
  if (total > 0 && host && (!hostState || (hostState.approved && hostState.consent === 'accepted')))
    known.set(host.id, host.name)
  if (match.operations) {
    for (const p of match.operations.participants)
      if (p.approved && p.consent === 'accepted') known.set(p.userId, p.name)
  } else {
    for (const entry of confirmed(data, match)) {
      const person = data.users.find(p => p.id === entry.userId)
      if (person) known.set(person.id, person.name)
    }
  }
  const people = [...known].slice(0, Math.min(total, 5)).map(([id, name]) => ({ id, name }))
  return { people, hidden: Math.max(0, total - people.length), empty: Math.max(0, match.capacity - total) }
}
