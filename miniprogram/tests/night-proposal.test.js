const test = require('node:test');
const assert = require('node:assert/strict');
const { proposalDisplay } = require('../utils/proposal-display');
const players = n => Array.from({ length: n }, (_, i) => ({ playerId: 100 + i, seatNo: i + 1 }));
const entry = { status: 'APPROVED', resolved: true, leaderPlayerId: 100, teamPlayerIds: [100, 102],
  votes: [{ seatNo: 1, choice: 'REJECT' }, { seatNo: 2, choice: 'APPROVE' }],
  mission: { missionNo: 1, status: 'FAILED', successCount: 1, failCount: 1 } };
for (let n = 5; n <= 10; n++) test(`${n} seats: configured cells, independent team border and leader`, () => {
  const result = proposalDisplay(entry, players(n), n);
  assert.equal(result.voteCells.length, n);
  assert.deepEqual(result.voteCells[0], { seatNo: 1, tone: 'reject', selected: true, leader: true });
  assert.equal(result.voteCells[1].tone, 'approve');
  assert.equal(result.voteCells[2].tone, 'pending');
  assert.ok(result.voteCells.every(c => c.tone !== 'disabled'));
});
test('unresolved or unpublished votes stay neutral even if input contains partial votes', () => {
  for (const change of [{status:'VOTING'}, {resolved:false}, {votes:[]}]) {
    const result = proposalDisplay({...entry, ...change}, players(10));
    assert.ok(result.voteCells.every(c => c.tone === 'pending'));
  }
});
test('approval is not mission success; only validated anonymous totals produce result borders', () => {
  assert.equal(proposalDisplay({...entry, mission:null}).resultTone, 'pending');
  assert.equal(proposalDisplay({...entry, mission:{...entry.mission,status:'EXECUTING'}}).resultTone, 'pending');
  assert.equal(proposalDisplay({...entry, mission:{...entry.mission,failCount:-1}}).resultTone, 'pending');
  assert.equal(proposalDisplay(entry).resultTone, 'failed');
  assert.equal(proposalDisplay({...entry, mission:{...entry.mission,status:'SUCCESS'}}).resultTone, 'success');
  assert.equal(proposalDisplay({...entry, status:'REJECTED'}).resultTone, 'rejected');
});
test('projection never carries private role data or per-player mission actions', () => {
  const result=proposalDisplay({...entry, actions:[{playerId:100, choice:'FAIL'}]}, players(5).map(p=>({...p,roleCode:'MERLIN'})));
  assert.doesNotMatch(JSON.stringify(result), /MERLIN|actions|playerId|choice/);
});

test('configured seat count survives offline or missing player records', () => {
  const result = proposalDisplay(entry, players(3).map(p => ({...p, online:false})), 8);
  assert.equal(result.voteCells.length, 8);
  assert.equal(result.voteCells[7].seatNo, 8);
  assert.equal(result.voteCells[7].tone, 'pending');
});

for (const [status, mission, text, tone] of [
  ['REJECTED', null, '提案未通过', 'rejected'],
  ['APPROVED', null, '任务进行中', 'pending'],
  ['APPROVED', {missionNo:1,status:'SUCCESS',successCount:2,failCount:0}, '任务成功', 'success'],
  ['APPROVED', {missionNo:4,status:'SUCCESS',successCount:3,failCount:1}, '任务成功 · 1 张失败牌', 'success'],
  ['APPROVED', {missionNo:1,status:'FAILED',successCount:1,failCount:1}, '任务失败 · 1 张失败牌', 'failed'],
  ['APPROVED', {missionNo:4,status:'FAILED',successCount:2,failCount:2}, '任务失败 · 2 张失败牌', 'failed'],
  ['APPROVED', {missionNo:5,status:'FAILED',successCount:1,failCount:3}, '任务失败 · 3 张失败牌', 'failed'],
]) test(`public result copy and border: ${text}`, () => {
  const result = proposalDisplay({...entry, status, mission});
  assert.equal(result.resultText, text);
  assert.equal(result.resultTone, tone);
});
test('unresolved proposal never reveals injected mission counts or actions', () => {
  const result = proposalDisplay({...entry, resolved:false, actions:[{playerId:100,choice:'FAIL'}]});
  assert.equal(result.resultText, '任务进行中');
  assert.equal(result.resultTone, 'pending');
  assert.doesNotMatch(JSON.stringify(result), /失败牌|actions|playerId|choice/);
});
