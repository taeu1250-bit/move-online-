import { createHmac } from 'node:crypto'

const origin = 'https://moov-mirae-online-dev.jj04020985.chatgpt.site'
export function jobCredential(serviceToken) {
  return createHmac('sha256', serviceToken)
    .update('moov:reminders:v1:' + origin)
    .digest('hex')
}
async function readToken() {
  if (!process.stdin.isTTY) {
    let input = ''
    for await (const chunk of process.stdin) input += chunk
    return input.trim()
  }
  process.stdin.setRawMode(true)
  process.stdin.setEncoding('utf8')
  process.stderr.write('Ready for Sites service token on hidden stdin.\n')
  let line = ''
  for await (const chunk of process.stdin) {
    line += chunk
    if (/[\r\n]/.test(line)) break
  }
  process.stdin.setRawMode(false)
  process.stdin.pause()
  return line.trim()
}
const token = await readToken()
if (!token) throw new Error('Missing Sites service credential.')
const lifecycle = process.argv.includes('--lifecycle')
const result = await fetch(origin + (lifecycle ? '/api/lifecycle/run' : '/api/reminders/run'), {
  method: 'POST',
  redirect: 'error',
  headers: {
    'OAI-Sites-Authorization': 'Bearer ' + token,
    'X-Moov-Job-Key': jobCredential(token),
  },
})
if (!result.ok) throw new Error('Server job HTTP ' + result.status)
const data = await result.json()
const { enabled = true, inbox, sent, checked, changed, at } = data
console.log(JSON.stringify(lifecycle ? { checked, changed, at } : { enabled, inbox, sent }))
