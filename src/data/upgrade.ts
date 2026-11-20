import type { Data } from '../domain/model.ts'

// Seed IDs are stable across releases. Preserve the schedule, roster and every user-created listing.
export function updateDemoCatalog(saved: Data, catalog: Data): Data {
  if (saved.catalogRevision === 2) return saved
  const teamNames = new Map<string, string>()
  const users = saved.users.map((user) => {
    const sample = catalog.users.find((item) => item.id === user.id)
    if (!user.team || !sample?.team) return user
    teamNames.set(user.team, sample.team)
    return { ...user, team: sample.team, teamSport: sample.teamSport }
  })
  const matches = saved.matches.map((match) => {
    const sample = catalog.matches.find((item) => item.id === match.id)
    return sample ? { ...match, title: sample.title, venue: sample.venue } : match
  })
  const basketball = catalog.matches.find((m) => m.id === 'basket-friendly')
  if (basketball && !matches.some((m) => m.id === basketball.id)) {
    matches.push({
      ...basketball,
      start: matches.find((m) => m.id === 'gym')?.start ?? basketball.start,
    })
  }
  const entries = saved.entries.map((entry) =>
    entry.team ? { ...entry, team: teamNames.get(entry.team) ?? entry.team } : entry,
  )
  const notices = saved.notices.map((notice) => {
    const before = saved.matches.find((m) => m.id === notice.matchId)
    const after = matches.find((m) => m.id === notice.matchId)
    if (!before || !after || !notice.text.startsWith(before.title + ' · ')) return notice
    let message = notice.text.slice(before.title.length + 3)
    for (const [oldName, newName] of teamNames) {
      if (message.startsWith(oldName + ' ')) {
        message = newName + message.slice(oldName.length)
        break
      }
    }
    return { ...notice, text: after.title + ' · ' + message }
  })
  return { ...saved, catalogRevision: 2, users, matches, entries, notices }
}
