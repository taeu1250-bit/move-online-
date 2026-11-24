import { requireValue, HttpError } from './identity.mjs'
import { isAdmin } from './reports-v2.mjs'
import { chatPolicy as P, chatReportReasons } from '../src/domain/chat.ts'

const q = (db, sql, ...args) => db.prepare(sql).bind(...args)
const ok = (value, status, message) => requireValue(value, status, message)
// Numbered parameters are actor, matchId, server time, then command data.
const from = `FROM matches m LEFT JOIN match_operations o ON o.matchId=m.id
  LEFT JOIN chat_rooms r ON r.matchId=m.id`
const member = `(m.hostId=?1 OR CASE WHEN o.matchId IS NOT NULL THEN
  EXISTS(SELECT 1 FROM json_each(o.state,'$.people') p WHERE
    json_extract(p.value,'$.userId')=?1 AND json_extract(p.value,'$.approved')=1
    AND json_extract(p.value,'$.consent')='accepted')
  ELSE EXISTS(SELECT 1 FROM entries e WHERE e.matchId=m.id AND e.status='approved'
    AND (e.userId=?1 OR ?1 IN (SELECT value FROM json_each(COALESCE(e.memberIds,'[]'))))) END)`
// V2 uses the recorded actual start (manual or automatic), never the scheduled
// start. Legacy matches have no actual-start record, so retain a scheduled fallback.
const closesAt = `CASE WHEN o.matchId IS NOT NULL THEN json_extract(o.state,'$.startedAt')+${P.hoursAfterStart*3600000}
  ELSE unixepoch(m.start)*1000+${P.hoursAfterStart*3600000} END`
const live = `m.cancelledAt IS NULL AND r.closedAt IS NULL
  AND json_extract(o.state,'$.cancelledAt') IS NULL AND COALESCE(json_extract(o.state,'$.invalidated'),0)=0
  AND ((${closesAt}) IS NULL OR ?3<(${closesAt}))`
const moderator = `(?4=1 AND EXISTS(SELECT 1 FROM generalReports g
  WHERE g.targetType='chat' AND g.targetId=m.id AND g.state='pending'))`

function validateMatch(matchId) {
  ok(typeof matchId === 'string' && matchId.length>0 && matchId.length<=128, 400, '경기를 확인해 주세요.')
}
function textBody(body, allowEmpty = false) {
  ok(typeof body === 'string' && body.length<=P.maxLength && (allowEmpty || body.trim()), 400,
    `내용은 ${P.maxLength}자 이내로 입력해 주세요.`)
  ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body), 400, '지원하지 않는 문자가 있어요.')
  return body.trim()
}
function expiry(db, actor, matchId, at) {
  // No background sweep: only the requested room is checked. Lifecycle triggers
  // close rooms atomically on cancel; time expiry is enforced on every request.
  return q(db, `UPDATE chat_rooms SET closedAt=?3,closeReason='expired',announcement=NULL
    WHERE matchId=?2 AND closedAt IS NULL AND EXISTS(SELECT 1 ${from}
    WHERE m.id=?2 AND NOT (${live})) AND ?1 IS NOT NULL`, actor,matchId,at)
}
function ensureRoom(db, actor, matchId, at) {
  return q(db, `INSERT INTO chat_rooms(matchId,createdAt)
    SELECT m.id,?3 ${from} WHERE m.id=?2 AND ${member} AND (${live})
    ON CONFLICT(matchId) DO NOTHING`,actor,matchId,at)
}

export async function readChat(db, actor, matchId, after = 0, env = {}, at = Date.now()) {
  validateMatch(matchId)
  ok(Number.isSafeInteger(after) && after>=0,400,'메시지 위치를 확인해 주세요.')
  const args = [actor,matchId,at,Number(isAdmin(env,actor))]
  const result = await db.batch([
    expiry(db,actor,matchId,at),
    q(db, `SELECT m.title,m.hostId,r.closeReason,r.announcement,(${closesAt}) AS closesAt,
      (${member}) AS participant, (${live}) AS isOpen, (${moderator}) AS moderation,
      EXISTS(SELECT 1 FROM generalReports g WHERE g.targetType='chat' AND g.targetId=m.id AND g.reporter=?1) AS reported
      ${from} WHERE m.id=?2`,...args),
    q(db, `SELECT c.seq,c.nonce,c.senderId,p.name,c.body,c.at ${from}
      JOIN chat_messages c ON c.matchId=m.id JOIN profiles p ON p.id=c.senderId
      WHERE m.id=?2 AND (${member} OR ${moderator}) AND (${live}) AND c.seq>?5
      ORDER BY c.seq DESC LIMIT ${P.recentMessages}`,...args,after),
  ])
  const row = result[1].results[0]
  ok(row,404,'경기가 없어요.')
  ok(row.participant || row.moderation,403,'모집자와 참가가 확정된 회원만 채팅을 이용할 수 있어요.')
  const closed = !row.isOpen
  return {matchId,title:row.title,hostId:row.hostId,closed,closesAt:row.closesAt,
    closeReason:row.closeReason || (closed?'ended':null),
    announcement:closed?null:row.announcement,
    canPost:!!row.participant && !closed,canManage:row.hostId===actor && !closed,
    canReport:!!row.participant && !closed && !row.reported,
    moderation:!!row.moderation && !row.participant,reported:!!row.reported,
    messages:closed?[]:result[2].results.reverse()}
}

export async function chatCommand(db, actor, input, env = {}, at = Date.now()) {
  validateMatch(input.matchId)
  const {matchId,type} = input
  ok(['send','announce','report'].includes(type),400,'채팅 요청을 확인해 주세요.')
  // Check once for helpful errors. Every write repeats the current gate inside
  // its SQL statement, so approval revocation/start races cannot bypass it.
  const room = await readChat(db,actor,matchId,0,env,at)
  ok(room.canPost,409,room.closed?'채팅이 종료되어 대화가 삭제됐어요.':'참가자만 채팅할 수 있어요.')
  if (type==='send') {
    const body = textBody(input.body)
    ok(typeof input.nonce==='string' && /^[a-zA-Z0-9-]{16,64}$/.test(input.nonce),400,'전송 번호를 확인해 주세요.')
    const previous = await q(db,'SELECT senderId,matchId,body FROM chat_messages WHERE nonce=?',input.nonce).first()
    if(previous) {
      ok(previous.senderId===actor && previous.matchId===matchId && previous.body===body,409,'이미 사용한 전송 번호예요.')
      return {ok:true}
    }
    const results=await db.batch([
      ensureRoom(db,actor,matchId,at),
      q(db,`INSERT INTO chat_messages(nonce,matchId,senderId,body,at)
        SELECT ?4,m.id,?1,?5,?3 ${from} WHERE m.id=?2 AND ${member} AND (${live})
        AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE senderId=?1 AND at>?3-${P.sendCooldownMs})
        AND (SELECT count(*) FROM chat_messages WHERE senderId=?1 AND at>?3-60000)<${P.sendsPerMinute}
        AND (SELECT count(*) FROM chat_messages WHERE matchId=?2)<${P.messagesPerRoom}
        ON CONFLICT(nonce) DO NOTHING`,actor,matchId,at,input.nonce,body),
    ])
    if(!results[1].meta.changes) {
      const retry=await q(db,'SELECT senderId,matchId,body FROM chat_messages WHERE nonce=?',input.nonce).first()
      if(retry?.senderId===actor && retry.matchId===matchId && retry.body===body) return {ok:true}
      throw new HttpError(409,`전송할 수 없어요. 참가 상태를 확인하거나 잠시 후 다시 보내 주세요. 방당 최대 ${P.messagesPerRoom}개까지 보낼 수 있어요.`)
    }
  } else if(type==='announce') {
    ok(room.canManage,403,'모집자만 공지를 작성할 수 있어요.')
    const body=textBody(input.body,true)
    const results=await db.batch([
      ensureRoom(db,actor,matchId,at),
      q(db,`UPDATE chat_rooms SET announcement=?4 WHERE matchId=?2 AND EXISTS(
        SELECT 1 ${from} WHERE m.id=?2 AND m.hostId=?1 AND (${live}))`,actor,matchId,at,body||null),
    ])
    ok(results[1].meta.changes,409,'채팅이 종료되었거나 모집자 권한이 변경됐어요.')
  } else {
    ok(chatReportReasons.includes(input.reason),400,'신고 사유를 선택해 주세요.')
    const r=await q(db,`INSERT INTO generalReports(id,reporter,targetType,targetId,reason,at,state)
      SELECT ?4,?1,'chat',m.id,?5,?3,'pending' ${from} WHERE m.id=?2 AND ${member} AND (${live})
      AND NOT EXISTS(SELECT 1 FROM generalReports WHERE reporter=?1 AND targetType='chat' AND targetId=?2)
      AND (SELECT count(*) FROM generalReports WHERE reporter=?1 AND at>?3-86400000)<${P.reportsPerDay}`,
      actor,matchId,at,crypto.randomUUID(),input.reason).run()
    ok(r.meta.changes,409,'이미 신고했거나 신고 가능 횟수를 초과했어요.')
  }
  return {ok:true}
}
