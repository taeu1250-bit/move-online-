import {
  identify,
  firebaseConfig,
  HttpError,
  requireValue,
} from './identity.mjs'
import { execute, saveProfile, snapshot } from './store.mjs'
import { inviteLink } from './invite-links.mjs'
import { readChat, chatCommand } from './chat.mjs'
import { activityPage, matchDetail, matchesByDay } from './activity.mjs'
function reply(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization, X-Moov-ID-Token',
    },
  })
}
export async function handleApi(request, env) {
  const url = new URL(request.url)
  try {
    if (url.pathname === '/api/config' && request.method === 'GET')
      return reply({ firebase: firebaseConfig(env) })
    const paths = {
      '/api/state': 'GET',
      '/api/activity': 'GET',
      '/api/match': 'GET',
      '/api/matches': 'GET',
      '/api/members': 'GET',
      '/api/team-invite': request.method === 'GET' ? 'GET' : 'POST',
      '/api/chat': request.method === 'GET' ? 'GET' : 'POST',
      '/api/profile': 'POST',
      '/api/command': 'POST',
    }
    requireValue(Object.hasOwn(paths, url.pathname), 404, '해당 경로가 없어요.')
    requireValue(
      request.method === paths[url.pathname],
      405,
      '지원하지 않는 요청 방식이에요.',
    )
    if (request.method === 'POST') {
      const origin = request.headers.get('Origin')
      requireValue(
        !origin || origin === url.origin,
        403,
        '요청 출처를 확인해 주세요.',
      )
      requireValue(
        request.headers.get('Content-Type')?.split(';')[0] ===
          'application/json',
        415,
        'JSON 요청이 필요해요.',
      )
    }
    const actor = await identify(request, env)
    requireValue(env.DB, 503, '개발 데이터베이스를 연결해 주세요.')
    if (url.pathname === '/api/activity')
      return reply(await activityPage(env.DB, actor, env, Object.fromEntries(url.searchParams)))
    if (url.pathname === '/api/match')
      return reply(await matchDetail(env.DB, actor, env, url.searchParams.get('id')))
    if (url.pathname === '/api/matches')
      return reply(await matchesByDay(env.DB, actor, env, url.searchParams.get('day')))
    if (url.pathname === '/api/chat' && request.method === 'GET')
      return reply(await readChat(env.DB, actor, url.searchParams.get('matchId'), Number(url.searchParams.get('after') || 0), env))
    if (url.pathname === '/api/team-invite' && request.method === 'GET')
      return reply(
        await inviteLink(
          env.DB,
          actor,
          { token: url.searchParams.get('token') },
          true,
        ),
      )
    if (url.pathname === '/api/members') {
      const query = (url.searchParams.get('q') || '').trim()
      requireValue(
        query.length >= 2 && query.length <= 30,
        400,
        '회원 이름을 2자 이상 입력해 주세요.',
      )
      const rows = await env.DB.prepare(
        'SELECT id,name,year FROM profiles WHERE id<>? AND instr(name,?)>0 ORDER BY name,id LIMIT 10',
      )
        .bind(actor, query)
        .all()
      return reply({ members: rows.results })
    }
    if (request.method === 'GET')
      return reply(await snapshot(env.DB, actor, env))
    const body = await request.text()
    requireValue(body.length <= 16000, 413, '요청이 너무 커요.')
    let input
    try {
      input = JSON.parse(body)
    } catch {
      throw new HttpError(400, '요청 형식을 확인해 주세요.')
    }
    requireValue(
      input && typeof input === 'object' && !Array.isArray(input),
      400,
      '요청 형식을 확인해 주세요.',
    )
    if (url.pathname === '/api/team-invite')
      return reply(await inviteLink(env.DB, actor, input))
    if (url.pathname === '/api/chat')
      return reply(await chatCommand(env.DB, actor, input, env))
    if (url.pathname === '/api/profile') await saveProfile(env.DB, actor, input)
    else await execute(env.DB, actor, input, env)
    return reply({ ok: true })
  } catch (error) {
    if (error instanceof HttpError)
      return reply({ error: error.message }, error.status)
    console.error(
      'moov request failed',
      request.method,
      url.pathname,
      error?.constructor?.name,
    )
    return reply(
      { error: '요청을 완료할 수 없어요. 잠시 뒤 다시 확인해 주세요.' },
      500,
    )
  }
}
