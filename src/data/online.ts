import { disableDevicePush } from '../screens/PushSettings'
import type { User as FirebaseUser } from 'firebase/auth'
import type { Data } from '../domain/model'
import type { Services, Snapshot } from './contracts'
import { mergeMatchData } from './contracts'

export async function api(user: FirebaseUser, path: string, body?: unknown) {
  const send = async (refresh: boolean) => {
    const token = await user.getIdToken(refresh)
    return fetch('/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: { 'X-Moov-ID-Token': token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
  let response = await send(false)
  if (response.status === 401) response = await send(true)
  if (response.status === 401)
    throw Object.assign(new Error('로그인이 만료됐어요. 다시 로그인해 주세요.'), {status: 401})
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || '서버에 연결할 수 없어요.'), {status: response.status})
  return data
}
export function onlineServices(
  user: FirebaseUser,
  logout: () => Promise<void>,
) {
  let state: Snapshot = { error: '경기를 불러오고 있어요.' }
  let generation = 0
  let selectedMatch = ''
  const listeners = new Set<() => void>()
  const publish = (next: Snapshot) => {
    state = next
    listeners.forEach((fn) => fn())
  }
  async function refresh() {
    const version = ++generation
    try {
      let data = await api(user, 'state')
      if (selectedMatch && !data.needsProfile) {
        try { data = mergeMatchData(data, await api(user, 'match?id=' + encodeURIComponent(selectedMatch))) }
        catch { selectedMatch = '' }
      }
      if (version === generation)
        publish(
          data.needsProfile ? { needsProfile: true } : { data: data as Data },
        )
    } catch (e) {
      if (version === generation && !state.data)
        publish({
          error: e instanceof Error ? e.message : '연결을 확인해 주세요.',
        })
    }
  }
  async function save(
    name: string,
    year: number,
    dept: string,
    skillLevel: string,
  ) {
    await api(user, 'profile', { name, year, dept, skillLevel })
    await refresh()
  }
  const services: Services = {
    findDay: day => api(user, 'matches?day=' + encodeURIComponent(day)),
    activity: (tab, status, cursor = '', scope = 'current') => api(user, 'activity?' + new URLSearchParams({tab, status, cursor, scope})),
    loadMatch: async (id) => {
      selectedMatch = id
      const version = generation
      const part = await api(user, 'match?id=' + encodeURIComponent(id))
      if (version === generation && selectedMatch === id && state.data)
        publish({ data: mergeMatchData(state.data, part) })
    },
    chat: {
      read: (matchId, after = 0) => api(user, 'chat?matchId=' + encodeURIComponent(matchId) + '&after=' + after),
      send: async (action) => {
        await api(user, 'chat', action)
        if (action.type === 'report') await refresh()
      },
    },
    inviteLink: async (input, read = false) =>
      api(
        user,
        read
          ? 'team-invite?token=' + encodeURIComponent(input.token || '')
          : 'team-invite',
        read ? undefined : input,
      ),
    searchMembers: async (query) =>
      (await api(user, 'members?q=' + encodeURIComponent(query))).members,
    matches: {
      snapshot: () => state,
      subscribe(fn) {
        listeners.add(fn)
        return () => {
          listeners.delete(fn)
        }
      },
      async execute(_actor, command) {
        try {
          await api(user, 'command', command)
        } finally {
          await refresh()
        }
      },
    },
    session: {
      async logout() {
        try {
          await disableDevicePush((endpoint) =>
            api(user, 'command', { type: 'pushUnsubscribe', endpoint }),
          )
        } finally {
          await logout()
        }
      },
      save,
    },
    refresh,
  }
  return services
}
