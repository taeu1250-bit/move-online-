import { createRoot } from 'react-dom/client'
import { OnlineRoot } from './screens/SchoolAuth'
import './styles.css'

createRoot(document.getElementById('root')!).render(<OnlineRoot />)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .catch(() => console.warn('오프라인 기능을 등록하지 못했어요.'))
  })
}
