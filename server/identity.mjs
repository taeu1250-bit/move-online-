import { verifiedClaims } from './token.mjs'
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
export function requireValue(value, status, message) {
  if (!value) throw new HttpError(status, message)
}
export function firebaseConfig(env) {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_WEB_API_KEY: apiKey } = env
  if (!projectId || !apiKey) return null
  return {
    projectId,
    apiKey,
    authDomain: env.FIREBASE_AUTH_DOMAIN || projectId + '.firebaseapp.com',
    appId: env.FIREBASE_APP_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
    measurementId: env.FIREBASE_MEASUREMENT_ID,
  }
}
// accounts:lookup validates the ID token with Google. Claims below are trusted
// only after Google accepts the same token and returns the matching account.
export async function identify(request, env) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(
    request.headers.has('X-Moov-ID-Token')
      ? 'Bearer ' + request.headers.get('X-Moov-ID-Token')
      : request.headers.get('Authorization') || '',
  )
  requireValue(match && match[1].length < 12000, 401, '로그인이 필요해요.')
  const config = firebaseConfig(env)
  requireValue(config, 503, '학교 이메일 인증 설정을 기다리고 있어요.')
  const token = match[1]
  const claims = await verifiedClaims(token, config.projectId)
  const now = Date.now() / 1000
  requireValue(
    claims &&
      typeof claims === 'object' &&
      claims.aud === config.projectId &&
      claims.iss === 'https://securetoken.google.com/' + config.projectId &&
      typeof claims.sub === 'string' &&
      claims.sub.length > 0 &&
      claims.sub.length <= 128 &&
      Number.isFinite(claims.iat) &&
      claims.iat <= now + 30 &&
      Number.isFinite(claims.exp) &&
      claims.exp > now &&
      Number.isFinite(claims.auth_time) &&
      claims.auth_time <= now + 60 &&
      claims.firebase?.sign_in_provider === 'password',
    401,
    '이 앱의 학교 이메일 계정으로 로그인해 주세요.',
  )
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      encodeURIComponent(env.FIREBASE_SERVER_API_KEY || config.apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    },
  )
  if (response.status === 429 || response.status >= 500)
    throw new HttpError(503, '인증 서버에 잠시 연결할 수 없어요.')
  requireValue(response.ok, 401, '다시 로그인해 주세요.')
  const account = (await response.json()).users?.[0]
  requireValue(
    account &&
      account.localId === claims.sub &&
      !account.disabled &&
      Number(account.validSince || 0) <= claims.auth_time,
    401,
    '다시 로그인해 주세요.',
  )
  requireValue(
    account.emailVerified === true &&
      claims.email_verified === true &&
      typeof account.email === 'string' &&
      claims.email === account.email &&
      /^[^@\s]+@yonsei\.ac\.kr$/i.test(account.email),
    403,
    '연세대학교 이메일 소유 확인이 필요해요.',
  )
  return account.localId
}
