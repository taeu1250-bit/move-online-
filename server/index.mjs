import { runLifecycle } from './operations.mjs'
import { runReminders } from './reminders.mjs'
import { handleApi } from './api.mjs'
import assets from 'moov:client-assets'
import { frameAncestors } from './security.mjs'
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runLifecycle(env.DB))
    if (env.MOOV_REMINDERS_ENABLED === '1')
      ctx.waitUntil(runReminders(env.DB, env))
  },
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    // Separate server credential also protects the job if the site's audience changes.
    if (
      pathname === '/api/reminders/run' ||
      pathname === '/api/lifecycle/run'
    ) {
      if (
        request.method !== 'POST' ||
        request.headers.has('Origin') ||
        request.headers.has('oai-authenticated-user-id') ||
        !env.MOOV_JOB_KEY ||
        request.headers.get('X-Moov-Job-Key') !== env.MOOV_JOB_KEY ||
        new URL(request.url).origin !== env.MOOV_JOB_ORIGIN
      )
        return new Response(null, { status: 403 })
      if (pathname === '/api/lifecycle/run')
        return Response.json(await runLifecycle(env.DB), {
          headers: { 'Cache-Control': 'no-store' },
        })
      if (env.MOOV_REMINDERS_ENABLED !== '1')
        return Response.json(
          { enabled: false, inbox: 0, sent: 0 },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      return Response.json(await runReminders(env.DB, env), {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    if (pathname.startsWith('/api/')) return handleApi(request, env)
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405 })
    const asset = assets[pathname === '/' ? '/index.html' : pathname]
    if (
      !Object.hasOwn(assets, pathname === '/' ? '/index.html' : pathname) ||
      !asset
    )
      return new Response(null, { status: 404 })
    const [type, encoded] = asset
    const headers = {
      ...(type.startsWith('text/html') ? { 'Content-Security-Policy': frameAncestors } : {}),
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    }
    return new Response(
      request.method === 'HEAD'
        ? null
        : Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
      { headers },
    )
  },
}
