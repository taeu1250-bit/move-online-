import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
test('lifecycle writer requires its server secret and rejects browser or visitor access', async (t) => {
  const mf = testRuntime({
    bindings: {
      MOOV_JOB_KEY: 'local-test-secret',
      MOOV_JOB_ORIGIN: 'https://moov.test',
    },
  })
  t.after(() => mf.dispose())
  await migrateLocal(mf)
  const call = (headers = {}, method = 'POST', origin = 'https://moov.test') =>
    mf.dispatchFetch(origin + '/api/lifecycle/run', { method, headers })
  for (const headers of [
    {},
    { 'X-Moov-Job-Key': 'incorrect' },
    { 'X-Moov-Job-Key': 'local-test-secret', Origin: 'https://moov.test' },
    {
      'X-Moov-Job-Key': 'local-test-secret',
      'oai-authenticated-user-id': 'someone',
    },
  ])
    assert.equal((await call(headers)).status, 403)
  assert.equal(
    (await call({ 'X-Moov-Job-Key': 'local-test-secret' }, 'GET')).status,
    403,
  )
  assert.equal(
    (
      await call(
        { 'X-Moov-Job-Key': 'local-test-secret' },
        'POST',
        'https://wrong.test',
      )
    ).status,
    403,
  )
  const response = await call({ 'X-Moov-Job-Key': 'local-test-secret' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).changed, 0)
})
