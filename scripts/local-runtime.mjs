import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const project = 'demo-moov-dev'
const emulator = new URL('http://127.0.0.1:9099')
// This Node-only adapter runs outside the deployed Worker. The production build
// has no emulator transport and always calls Google's HTTPS service.
export function testRuntime(options = {}) {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: options.scriptPath || 'dist/server/index.js',
      compatibilityDate: '2026-06-01',
      host: '127.0.0.1',
      port: options.port || 0,
      d1Databases: ['DB'],
      d1Persist: options.persist || false,
      bindings: {
        ...options.bindings,
        FIREBASE_PROJECT_ID: project,
        FIREBASE_WEB_API_KEY: 'local-test-key',
        MOOV_TEAM_LEADERS: JSON.stringify(options.leaders || {}),
      },
      outboundService:
        options.identity ||
        (async (req) => {
          const target = new URL(req.url)
          if (
            target.origin !== 'https://identitytoolkit.googleapis.com' ||
            target.pathname !== '/v1/accounts:lookup'
          )
            return new Response(null, { status: 403 })
          return fetch(
            new URL(
              '/identitytoolkit.googleapis.com' +
                target.pathname +
                target.search,
              emulator,
            ),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: await req.text(),
              redirect: 'error',
            },
          )
        }),
    }),
  )
}
export async function migrateLocal(runtime) {
  const db = await runtime.getD1Database('DB')
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS local_migrations(tag TEXT PRIMARY KEY)',
    )
    .run()
  const dir = new URL('../drizzle/', import.meta.url)
  const journal = JSON.parse(
    await readFile(new URL('meta/_journal.json', dir), 'utf8'),
  )
  for (const { tag } of journal.entries) {
    if (
      await db
        .prepare('SELECT tag FROM local_migrations WHERE tag=?')
        .bind(tag)
        .first()
    )
      continue
    const migration = await readFile(new URL(tag + '.sql', dir), 'utf8')
    const sql = migration
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    await db.batch([
      ...sql.map((q) => db.prepare(q)),
      db.prepare('INSERT INTO local_migrations VALUES(?)').bind(tag),
    ])
  }
  return db
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mf = testRuntime({
    port: 8788,
    scriptPath: '.sites-runtime/emulator/index.js',
    persist: '.sites-runtime/local-d1',
    leaders: JSON.parse(process.env.MOOV_TEAM_LEADERS || '{}'),
  })
  await migrateLocal(mf)
  console.log('Local moov. · ' + (await mf.ready))
  process.once('SIGINT', async () => {
    await mf.dispose()
    process.exit(0)
  })
}
