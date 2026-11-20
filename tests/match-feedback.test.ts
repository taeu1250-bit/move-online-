import assert from 'node:assert/strict'
import test from 'node:test'
import { levelMismatch, matchInfoTags, rosterError, validEndAt, validMatchInfo } from '../src/domain/feedback.ts'

test('roster validation includes its representative and checks linked accounts', () => {
  assert.equal(rosterError('모집자',['김민수', '박지은'],[null,'player-2']), '')
  assert.notEqual(rosterError('모집자',['  ']), '')
  assert.notEqual(rosterError('모집자',[' 모집자 ']), '')
  assert.notEqual(rosterError('모집자',['하늘','하늘'.normalize('NFD')]), '')
  assert.notEqual(rosterError('모집자',['김민수','박지은'],['a','a']), '')
  assert.notEqual(rosterError('모집자',['김민수'],[null,null]), '')
  assert.notEqual(rosterError('모집자', Array.from({length:30},(_,i)=>String(i))), '')
  assert.equal(rosterError('모집자',Array.from({length:29},(_,i)=>String(i))), '')
})
test('optional match info omits unspecified criteria and enforces per-sport fields', () => {
  const base = {sport:'풋살',kind:'pickup',level:'',start:'2026-11-16T10:00:00.000Z',capacity:12} as const
  assert.deepEqual(matchInfoTags(base),['정원 12명'])
  assert.deepEqual(matchInfoTags({...base,level:'중급 이상',info:{gender:'남녀모두',format:'5vs5',shoes:'풋살화'},endAt:'2026-11-16T12:30:00.000Z'}),['남녀모두','중급 이상','5vs5','정원 12명','2시간 30분','풋살화'])
  assert.ok(validMatchInfo('풋살',{gender:'남녀모두',format:'6vs6',shoes:'운동화'}))
  assert.ok(!validMatchInfo('농구',{format:'11vs11'}))
  assert.ok(!validMatchInfo('축구',{shoes:'풋살화'}))
  assert.ok(validMatchInfo('러닝',{distanceKm:5.5,pace:'6:45'}))
  assert.ok(!validMatchInfo('러닝',{distanceKm:0}))
  assert.ok(!validMatchInfo('러닝',{pace:'7:99'}))
  assert.ok(!validMatchInfo('러닝',{pace:'0:00'}))
  assert.ok(validMatchInfo('헬스',{goal:'하체 근력'}))
  assert.ok(!validMatchInfo('헬스',{format:'5vs5'}))
  assert.ok(!validMatchInfo('풋살',{format:'5vs5vs5'}))
  assert.ok(!validMatchInfo('풋살',{fake:'field'}))
  assert.ok(!validEndAt(base.start,base.start))
  assert.ok(validEndAt(base.start,undefined))
  assert.ok(!validEndAt(base.start,'invalid'))
})
test('sport-specific mismatch prompts account for ranges, older values and unset levels', () => {
  assert.equal(levelMismatch('초보','고수'),true)
  assert.equal(levelMismatch('중급 이상','중급'),false)
  assert.equal(levelMismatch('중급 이상','초보'),true)
  assert.equal(levelMismatch('초보~중급','고수'),true)
  assert.equal(levelMismatch('모든 레벨','고수'),false)
  assert.equal(levelMismatch('누구나 환영','초보'),false)
  assert.equal(levelMismatch('숙련자 위주','고수'),false)
  assert.equal(levelMismatch('중급',undefined),false)
})
