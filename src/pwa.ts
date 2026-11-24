let registration: Promise<ServiceWorkerRegistration> | undefined
export function registerAppWorker() {
  if (!('serviceWorker' in navigator)) return undefined
  registration ??= navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).catch(e => { registration = undefined; throw e })
  return registration
}
function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => done(new Error('업데이트가 지연되고 있어요. 잠시 후 다시 시도해 주세요.')), 20_000)
    const done = (error?: Error) => { clearTimeout(timer); worker.removeEventListener('statechange', check); error ? reject(error) : resolve() }
    const check = () => {
      if (worker.state === 'activated') done()
      else if (worker.state === 'redundant') done(new Error('업데이트 파일을 받지 못했어요. 연결을 확인해 주세요.'))
      else if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' })
    }
    worker.addEventListener('statechange', check); check()
  })
}
export async function updateApp() {
  if (!navigator.onLine) throw new Error('인터넷에 연결한 뒤 업데이트해 주세요.')
  const ready = registerAppWorker()
  if (ready) {
    const reg = await ready
    await reg.update()
    const worker = reg.installing || reg.waiting || reg.active
    if (worker && worker.state !== 'activated') await activated(worker)
  }
  // No clearing of Firebase persistence, localStorage, or application records.
  location.reload()
}
