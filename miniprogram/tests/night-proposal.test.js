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
