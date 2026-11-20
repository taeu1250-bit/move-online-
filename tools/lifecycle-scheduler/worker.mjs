const ORIGIN = 'https://moov-mirae-online-dev.jj04020985.chatgpt.site'

// Separate optional scheduler. No public trigger or database binding.
// Deploy only after the user connects their chosen Cloudflare account.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      if (!env.MOOV_JOB_KEY || !env.SITES_SERVICE_TOKEN) throw new Error('Scheduler secrets are missing')
      const response = await fetch(ORIGIN + '/api/lifecycle/run', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: {
          'X-Moov-Job-Key': env.MOOV_JOB_KEY,
          'OAI-Sites-Authorization': 'Bearer ' + env.SITES_SERVICE_TOKEN,
        },
      })
      if (!response.ok) throw new Error('Lifecycle HTTP ' + response.status)
      const {checked, changed} = await response.json()
      console.log(JSON.stringify({checked, changed}))
    })())
  },
  fetch() { return new Response(null, {status:404}) },
}
