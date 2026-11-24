import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

const root = process.argv.includes('--emulator') ? '.sites-runtime/emulator-client' : '.client-build'
async function list(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) result.push(...(await list(path)))
    else if (entry.name !== 'sw.js') result.push(path)
  }
  return result.sort()
}

const files = await list(root)
const hash = createHash('sha256')
hash.update(await readFile(new URL(import.meta.url)))
// Header-only security fixes must also invalidate cached HTML app shells.
hash.update(await readFile(new URL('../server/security.mjs', import.meta.url)))
for (const file of files) hash.update(file).update(await readFile(file))
const version = hash.digest('hex').slice(0, 14)
// Sites redirects index.html to the directory URL. Cache the final URL so that
// offline navigations receive a direct response rather than a cached redirect.
const urls = files.map((file) => file === join(root, 'index.html') ? './' : './' + relative(root, file).split(sep).join('/'))
const worker = `const prefix = 'moov:' + self.registration.scope + ':'
const cacheName = prefix + '${version}'
const files = ${JSON.stringify(urls)}
const staticUrls = new Set(files.map(file => new URL(file, self.registration.scope).href))
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('push',event=>{
  if(!event.data)return
  const n=event.data.json()
  if(typeof n.title!=='string' || typeof n.body!=='string')return
  event.waitUntil(self.registration.showNotification(n.title,{body:n.body,icon:'./icons/icon-192.png',tag:n.tag,data:{matchId:n.matchId}}))
})
self.addEventListener('notificationclick',event=>{
  event.notification.close()
  const id=encodeURIComponent(String(event.notification.data?.matchId||''))
  event.waitUntil(clients.openWindow(new URL('./#/match/'+id,self.registration.scope).href))
})
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname.startsWith('/api/')) return
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return
  const isNavigation = event.request.mode === 'navigate'
  if (!isNavigation && !staticUrls.has(event.request.url)) return
  event.respondWith(caches.open(cacheName).then(async cache => {
    // These URLs identify bundled static files; module and precache requests can carry different Origin headers.
    const key = isNavigation ? './' : event.request.url
    if (isNavigation) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      try {
        const response = await fetch(event.request, {cache:'no-store', signal:controller.signal})
        if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
          await cache.put(key, response.clone())
          return response
        }
        return (await cache.match(key, {ignoreVary:true})) || response
      } catch (error) {
        const saved = await cache.match(key, {ignoreVary:true})
        if (saved) return saved
        throw error
      } finally { clearTimeout(timer) }
    }
    return (await cache.match(key, { ignoreVary: true })) || fetch(event.request)
  }))
})`
await writeFile(join(root, 'sw.js'), worker)
console.log('PWA app shell: ' + files.length + ' files, ' + version)
