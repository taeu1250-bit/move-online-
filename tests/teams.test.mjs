import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import {
  teamState,
  teamCommand,
  getActiveTeam,
  resolveRosterLinks,
  rosterLinksGuard,
} from '../server/teams.mjs'

test('team management, private invitations and persistent role selection on D1', async (t) => {
  const mf = testRuntime()
  t.after(() => mf.dispose())
  const db = await migrateLocal(mf)
  for (const id of ['owner', 'member', 'other', 'third', 'legacy']) {
    await db
      .prepare('INSERT INTO profiles(id,name,year,dept) VALUES(?,?,2025,?)')
      .bind(id, id === 'member' ? '김회원' : id, '모바일학과')
      .run()
  }
  const first = crypto.randomUUID(),
    second = crypto.randomUUID()
  const cmd = (user, action) => teamCommand(db, user, action, {})
  const field = (name, sport) => ({
    name,
    sport,
    affiliation: '동아리',
    bio: '함께 운동해요.',
  })
  const reject = (fn, code) => assert.rejects(fn, (e) => e.status === code)
  await t.test(
    'two owned teams survive personal mode and switching devices',
    async () => {
      await cmd('owner', {
        type: 'team.create',
        id: first,
        fields: field('풋살팀', '풋살'),
        guests: [],
      })
      // Existing guest rows represent the v4 archive, never a newly accepted v2 participant.
      for(const name of ['김회원','게스트2'])await db.prepare("INSERT INTO team_members(id,teamId,guestName,status,updatedAt) VALUES(?,?,?,'guest',?)").bind(crypto.randomUUID(),first,name,new Date().toISOString()).run()
      await cmd('owner', {
        type: 'team.create',
        id: second,
        fields: field('농구팀', '농구'),
        guests: [],
      })
      assert.equal((await getActiveTeam(db, 'owner')).id, second)
      await cmd('owner', { type: 'team.switch', teamId: null })
      assert.equal(await getActiveTeam(db, 'owner'), null)
      assert.equal((await teamState(db, 'owner')).owned.length, 2)
      await cmd('owner', { type: 'team.switch', teamId: first })
      assert.equal((await teamState(db, 'owner')).activeTeamId, first)
      await reject(
        () => cmd('other', { type: 'team.switch', teamId: first }),
        409,
      )
      await reject(
        () =>
          cmd('other', {
            type: 'team.edit',
            teamId: first,
            revision: 0,
            fields: field('다른팀', '축구'),
          }),
        409,
      )
      const fields = field('풋살팀B', '풋살')
      await cmd('owner', {
        type: 'team.edit',
        teamId: first,
        revision: 0,
        fields,
      })
      await reject(
        () =>
          cmd('owner', {
            type: 'team.edit',
            teamId: first,
            revision: 0,
            fields,
          }),
        409,
      )
    },
  )
  let invitationId
  await t.test(
    'a guest is anonymous even with an existing member’s exact name; only the invitee can accept',
    async () => {
      assert.ok(
        (await teamState(db, 'owner')).owned
          .find((x) => x.id === first)
          .members.every((m) => m.userId === null && m.status === 'guest'),
      )
      await cmd('member', { type: 'team.code' })
      const code = (await teamState(db, 'member')).inviteCode
      assert.ok(/^[0-9a-f]{32}$/.test(code))
      await cmd('owner', { type: 'team.invite', teamId: first, code })
      await reject(
        () => cmd('owner', { type: 'team.invite', teamId: first, code }),
        409,
      )
      await reject(
        () => cmd('other', { type: 'team.invite', teamId: first, code }),
        409,
      )
      const inbox = await teamState(db, 'member')
      invitationId = inbox.memberships[0].id
      assert.equal(inbox.memberships[0].status, 'pending')
      assert.equal((await teamState(db, 'third')).memberships.length, 0)
      assert.equal((await teamState(db, 'third')).owned.length, 0)
      assert.equal(
        (await teamState(db, 'owner')).owned
          .find((t) => t.id === first)
          .members.find((m) => m.id === invitationId).userId,
        null,
      )
      await reject(
        () => resolveRosterLinks(db, 'owner', first, ['개명'], ['member']),
        403,
      )
      await reject(
        () =>
          cmd('other', {
            type: 'team.reply',
            memberId: invitationId,
            accept: true,
          }),
        409,
      )
      await cmd('member', {
        type: 'team.reply',
        memberId: invitationId,
        accept: false,
      })
      assert.equal((await teamState(db, 'member')).memberships.length, 0)
      await cmd('owner', { type: 'team.invite', teamId: first, code })
      await cmd('member', {
        type: 'team.reply',
        memberId: invitationId,
        accept: true,
      })
      assert.equal(
        (await teamState(db, 'member')).memberships[0].status,
        'accepted',
      )
      await reject(
        () =>
          cmd('member', {
            type: 'team.reply',
            memberId: invitationId,
            accept: true,
          }),
        409,
      )
      assert.deepEqual(
        await resolveRosterLinks(
          db,
          'owner',
          first,
          ['별명', '김회원'],
          ['member', null],
        ),
        { names: ['김회원', '김회원'], ids: ['member', null] },
      )
      await reject(
        () => resolveRosterLinks(db, 'owner', second, ['김회원'], ['member']),
        403,
      )
      await reject(
        () => resolveRosterLinks(db, 'third', first, ['김회원'], ['member']),
        403,
      )
      await reject(
        () =>
          resolveRosterLinks(
            db,
            'owner',
            first,
            ['김회원', '김회원'],
            ['member', 'member'],
          ),
        400,
      )
    },
  )
  await t.test(
    'revoking membership prevents stale links and preserves guests and activity mode',
    async () => {
      const guard = () =>
        db
          .prepare('SELECT ' + rosterLinksGuard + ' AS usable')
          .bind('["member"]', 'owner', first)
          .first('usable')
      assert.equal(await guard(), 1)
      await reject(
        () =>
          cmd('third', {
            type: 'team.remove',
            teamId: first,
            memberId: invitationId,
          }),
        409,
      )
      await cmd('owner', {
        type: 'team.remove',
        teamId: first,
        memberId: invitationId,
      })
      assert.equal(await guard(), 0)
      const roster = (await teamState(db, 'owner')).owned.find(
        (t) => t.id === first,
      ).members
      assert.ok(
        roster.some(
          (m) =>
            m.name === '김회원' && m.status === 'guest' && m.userId === null,
        ),
      )
      await reject(()=>cmd('owner',{type:'team.guest',teamId:first,name:'추가 팀원'}),400)
      await cmd('owner', {
        type: 'team.remove',
        teamId: first,
        memberId: roster[0].id,
      })
      await cmd('owner', { type: 'team.archive', teamId: first, revision: 1 })
      const hub = await teamState(db, 'owner')
      assert.equal(hub.activeTeamId, null)
      assert.equal(hub.owned.length, 2)
      assert.ok(hub.owned.find((t) => t.id === first).archivedAt)
      await reject(
        () => cmd('owner', { type: 'team.switch', teamId: first }),
        409,
      )
      assert.equal(await getActiveTeam(db, 'member'), null)
    },
  )
  await t.test(
    'existing verified legacy grants import once and the personal mode sticks',
    async () => {
      const env = {
        MOOV_TEAM_LEADERS: JSON.stringify({
          legacy: { name: '리베로', sport: '축구' },
        }),
      }
      assert.equal((await getActiveTeam(db, 'legacy', env)).name, '리베로')
      await teamCommand(
        db,
        'legacy',
        { type: 'team.switch', teamId: null },
        env,
      )
      assert.equal(await getActiveTeam(db, 'legacy', env), null)
      assert.equal((await teamState(db, 'legacy', env)).owned.length, 1)
    },
  )
})
