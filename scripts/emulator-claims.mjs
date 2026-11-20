// Build-time substitution only in the loopback Emulator artifact. The Worker also checks
// the token against the official local Auth Emulator through its local-only transport.
import { decodeJwt } from 'jose'
export async function verifiedClaims(token, projectId) {
  if (projectId !== 'demo-moov-dev') return null
  try {
    return decodeJwt(token)
  } catch {
    return null
  }
}
