import { createRemoteJWKSet, jwtVerify, errors } from 'jose'

// The key set is fixed by the server. JOSE checks the RS256 signature and rotates keys by kid.
const certificates = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
)
export async function verifiedClaims(token, projectId) {
  try {
    const { payload } = await jwtVerify(token, certificates, {
      algorithms: ['RS256'],
      issuer: 'https://securetoken.google.com/' + projectId,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'auth_time', 'sub', 'iss', 'aud'],
    })
    return payload
  } catch (error) {
    if (
      error instanceof errors.JWKSTimeout ||
      !(error instanceof errors.JOSEError)
    )
      throw error
    return null
  }
}
