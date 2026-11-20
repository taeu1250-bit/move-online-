import { useState, useEffect } from 'react'
import { useMoov } from '../ui/context'
export async function disableDevicePush(
  remove: (url: string) => Promise<void>,
) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    try {
      await remove(sub.endpoint)
    } finally {
      await sub.unsubscribe()
    }
  }
}
export function PushSettings() {
  const { data, act, busy } = useMoov()
  const [active, setActive] = useState(false),
    [note, setNote] = useState(''),
    [working, setWorking] = useState(false)
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  useEffect(() => {
    if (supported)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setActive(!!s))
        .catch(() => {})
  }, [supported])
  async function toggle() {
    setWorking(true)
    try {
      if (active) {
        await disableDevicePush(async (endpoint) => {
          await act({ type: 'pushUnsubscribe', endpoint })
        })
        setActive(false)
        return
      }
      if (!supported || !data.pushPublicKey) return
      if ((await Notification.requestPermission()) !== 'granted') {
        setNote(
          '이 기기의 알림 권한이 꺼져 있어요. 앱 내부 알림은 계속 확인할 수 있어요.',
        )
        return
      }
      const reg = await navigator.serviceWorker.ready
      const key = Uint8Array.from(
        atob(data.pushPublicKey.replaceAll('-', '+').replaceAll('_', '/')),
        (v) => v.charCodeAt(0),
      )
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      })
      if (await act({ type: 'pushSubscribe', subscription: sub.toJSON() })) {
        setActive(true)
        setNote('경기 시작 24시간 전과 3시간 전에 알려드려요.')
      } else await sub.unsubscribe()
    } catch {
      setNote('기기의 알림 설정과 인터넷 연결을 확인해 주세요.')
    } finally {
      setWorking(false)
    }
  }
  return (
    <section className="panel">
      <h2>경기 전 휴대폰 알림</h2>
      <p className="hint">
        참가가 확정된 경기의 24시간 전과 3시간 전 알림을 이 기기에서 받아요.
      </p>
      {supported ? (
        <button
          className="secondary"
          disabled={working || busy || !data.pushPublicKey}
          onClick={() => void toggle()}
        >
          {active ? '이 기기 알림 끄기' : '이 기기 알림 켜기'}
        </button>
      ) : (
        <p>아이폰은 iOS 16.4 이상에서 홈 화면에 추가한 뭅을 열어 주세요.</p>
      )}
      {note && <p role="status">{note}</p>}
    </section>
  )
}
