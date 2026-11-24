// Permit the official ChatGPT web shell and same-origin previews, never arbitrary
// chatgpt.site tenants. This does not grant app/API access or change Firebase auth.
export const frameAncestors = "frame-ancestors 'self' https://chatgpt.com"
