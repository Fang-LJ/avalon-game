const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('../utils/demo-game-engine');
const { chooseAction } = require('../utils/demo-bot-strategy');
const { configuration } = require('../utils/guest-content');
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function game(seed = 42, confirm = true) {
  const engine = createGame({ random: rng(seed) });
  engine.dispatch({ type: 'ADD_BOT', actorId: 1, count: 4 }); engine.dispatch({ type: 'START', actorId: 1 });
  if (confirm) for (let id = 1; id <= 5; id++) engine.dispatch({ type: 'CONFIRM', actorId: id });
  return engine;
}
function submit(engine, team = [1, 2]) {
  engine.dispatch({ type: 'TEAM', actorId: engine.getView().game.leaderPlayerId, team });
}
function vote(engine, approvals = 5) {
  for (let actorId = 1; actorId <= 5; actorId++) engine.dispatch({ type: 'VOTE', actorId, choice: actorId <= approvals ? 'APPROVE' : 'REJECT' });
}
function mission(engine, failed = false) {
  const g = engine.getView().game;
  const evilId = [1, 2, 3, 4, 5].find(id => engine.getView(id).game.evil);
  const team = [evilId, ...[1, 2, 3, 4, 5].filter(id => id !== evilId)].slice(0, g.requiredTeamSize);
  submit(engine, team); vote(engine);
  for (const actorId of team) engine.dispatch({ type: 'MISSION', actorId, choice: failed && actorId === evilId ? 'FAIL' : 'SUCCESS' });
}
function roleId(engine, role) { return [1, 2, 3, 4, 5].find(id => engine.getView(id).role.roleCode === role); }

test('lobby starts with one visitor, bots add singly or together, and early starts/overflow are rejected', () => {
  const e = createGame(); assert.equal(e.getView().room.currentPlayers, 1);
  assert.equal(e.getView().room.players[0].nickname, '体验玩家');
  assert.throws(() => e.dispatch({ type: 'START', actorId: 1 }));
  e.dispatch({ type: 'ADD_BOT', actorId: 1 }); e.dispatch({ type: 'ADD_BOT', actorId: 1, count: 3 });
  assert.deepEqual(e.getView().room.players.slice(1).map(p => p.nickname), ['机器人1', '机器人2', '机器人3', '机器人4']);
  assert.throws(() => e.dispatch({ type: 'ADD_BOT', actorId: 1 }));
});
test('five roles form the exact configuration, all roles and both kinds of leader occur across random deals', () => {
  const visitors = new Set(), leaders = new Set(), layouts = new Set();
  for (let seed = 1; seed <= 160; seed++) {
    const e = game(Math.imul(seed, 2654435761) >>> 0); const roles = [1, 2, 3, 4, 5].map(id => e.getView(id).role.roleCode);
    assert.deepEqual(roles.slice().sort(), ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'MORGANA', 'ASSASSIN'].sort());
    visitors.add(roles[0]); leaders.add(e.getView().game.leaderPlayerId); layouts.add(roles.join(','));
  }
  assert.equal(visitors.size, 5); assert.equal(leaders.size, 5); assert.ok(layouts.size > 50);
});
test('role confirmation gates playing, and duplicate confirmation and invalid actors do not advance state', () => {
  const e = game(42, false); e.dispatch({ type: 'CONFIRM', actorId: 1 });
  const before = e.getView();
  assert.throws(() => e.dispatch({ type: 'CONFIRM', actorId: 1 }));
  assert.throws(() => e.dispatch({ type: 'CONFIRM', actorId: 9 }));
  assert.throws(() => e.dispatch({ type: 'TEAM', actorId: 1, team: [1, 2] }));
  assert.deepEqual(e.getView(), before);
  for (let actorId = 2; actorId <= 5; actorId++) e.dispatch({ type: 'CONFIRM', actorId });
  assert.equal(e.getView().game.phase, 'TEAM_BUILDING');
});
test('team actions validate leadership, membership, size, duplicates and revision', () => {
  const e = game(), leader = e.getView().game.leaderPlayerId, before = e.getView();
  for (const team of [[1], [1, 1], [1, 9], [1, 2, 3]]) assert.throws(() => e.dispatch({ type: 'TEAM', actorId: leader, team }));
  assert.throws(() => e.dispatch({ type: 'TEAM', actorId: leader % 5 + 1, team: [1, 2] }));
  assert.throws(() => e.dispatch({ type: 'TEAM', actorId: leader, team: [1, 2] }, before.revision - 1));
  assert.deepEqual(e.getView(), before); submit(e);
  assert.equal(e.getView().game.phase, 'TEAM_VOTING');
});
for (const approvals of [0, 1, 2, 3, 4, 5]) test(`${approvals} approvals use strict majority, with votes secret until resolved`, () => {
  const e = game(), leader = e.getView().game.leaderPlayerId; submit(e);
  e.dispatch({ type: 'VOTE', actorId: 1, choice: approvals ? 'APPROVE' : 'REJECT' });
  assert.deepEqual(e.getView().timeline.proposals[0].votes, []);
  assert.throws(() => e.dispatch({ type: 'VOTE', actorId: 1, choice: 'APPROVE' }));
  for (let id = 2; id <= 5; id++) e.dispatch({ type: 'VOTE', actorId: id, choice: id <= approvals ? 'APPROVE' : 'REJECT' });
  assert.equal(e.getView().game.phase, approvals >= 3 ? 'MISSION_EXECUTING' : 'TEAM_BUILDING');
  assert.equal(e.getView().timeline.proposals[0].approveCount, approvals);
  if (approvals < 3) assert.equal(e.getView().game.leaderPlayerId, leader % 5 + 1);
});
test('mission validates membership, legal cards and duplicates; publishes only anonymous aggregate results', () => {
  const e = game(), good = roleId(e, 'LOYAL_SERVANT'), evil = roleId(e, 'ASSASSIN');
  submit(e, [good, evil]); vote(e);
  assert.throws(() => e.dispatch({ type: 'MISSION', actorId: good, choice: 'FAIL' }));
  assert.throws(() => e.dispatch({ type: 'MISSION', actorId: good, choice: 'BAD' }));
  assert.throws(() => e.dispatch({ type: 'MISSION', actorId: [1,2,3,4,5].find(id => ![good,evil].includes(id)), choice: 'SUCCESS' }));
  e.dispatch({ type: 'MISSION', actorId: good, choice: 'SUCCESS' });
  assert.equal(e.getView().game.latestMissionResult, null);
  assert.throws(() => e.dispatch({ type: 'MISSION', actorId: good, choice: 'SUCCESS' }));
  e.dispatch({ type: 'MISSION', actorId: evil, choice: 'FAIL' });
  assert.deepEqual(e.getView().game.latestMissionResult, { missionNo: 1, successCount: 1, failCount: 1, status: 'FAILED' });
  assert.equal(e.getView().game.missionNo, 2); assert.equal(e.getView().game.requiredTeamSize, 3);
  assert.doesNotMatch(JSON.stringify(e.getView().timeline.missions), /roleCode|actorId|actions|choice/);
});
test('five consecutive rejections finish evil; successful task resets count and rotates leader', () => {
  const e = game();
  for (let i = 0; i < 5; i++) { submit(e); vote(e, 2); }
  assert.equal(e.getView().game.finishReason, 'FIVE_REJECTED_TEAMS'); assert.equal(e.getView().game.winner, 'EVIL');
  assert.equal(e.botTurn(), null); assert.throws(() => e.dispatch({ type: 'VOTE', actorId: 1, choice: 'APPROVE' }));
  const f = game(); submit(f); vote(f, 1); const leader = f.getView().game.leaderPlayerId; mission(f);
  assert.equal(f.getView().game.consecutiveRejections, 0); assert.equal(f.getView().game.proposalNo, 1);
  assert.equal(f.getView().game.leaderPlayerId, leader % 5 + 1);
});
test('three failed missions end evil immediately without assassination', () => {
  const e = game(); for (let i = 0; i < 3; i++) mission(e, true);
  assert.equal(e.getView().game.phase, 'FINISHED'); assert.equal(e.getView().game.finishReason, 'THREE_FAILED_MISSIONS');
  assert.equal(e.getView().game.winner, 'EVIL'); assert.equal(e.getView().game.identities.length, 5);
});
for (const targetRole of ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT']) test(`three successes enter assassination; targeting ${targetRole} resolves correctly`, () => {
  const e = game(); for (let i = 0; i < 3; i++) mission(e);
  assert.equal(e.getView().game.phase, 'ASSASSINATION'); assert.equal(e.getView().game.winner, null);
  assert.equal(e.getView().game.revealedEvilIdentities.length, 2); assert.deepEqual(e.getView().game.identities, []);
  const assassin = roleId(e, 'ASSASSIN');
  assert.throws(() => e.dispatch({ type: 'ASSASSINATE', actorId: assassin, targetId: assassin }));
  assert.throws(() => e.dispatch({ type: 'ASSASSINATE', actorId: roleId(e, 'MERLIN'), targetId: roleId(e, 'PERCIVAL') }));
  e.dispatch({ type: 'ASSASSINATE', actorId: assassin, targetId: roleId(e, targetRole) });
  assert.equal(e.getView().game.winner, targetRole === 'MERLIN' ? 'EVIL' : 'GOOD');
});
test('visibility projections hide exact roles from Merlin/Percival/loyal and reveal only authorized evil teammates', () => {
  const e = game();
  for (const role of ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'MORGANA', 'ASSASSIN']) {
    const view = e.getView(roleId(e, role));
    assert.ok(view.room.players.every(p => !('roleCode' in p) && !('alignment' in p)));
    assert.deepEqual(view.game.identities, []); assert.deepEqual(view.game.revealedEvilIdentities, []);
    assert.equal(view.role.visiblePlayers.length, role === 'LOYAL_SERVANT' ? 0 : ['MORGANA','ASSASSIN'].includes(role) ? 1 : 2);
    if (['MERLIN','PERCIVAL'].includes(role)) assert.ok(view.role.visiblePlayers.every(p => !('roleCode' in p)));
  }
  const v = e.getView(); v.room.players[0].nickname = '污染'; assert.equal(e.getView().room.players[0].nickname, '体验玩家');
});
test('bot strategy consumes a limited private/public context and cannot access unrelated secret roles', () => {
  const e = game(42, false), turn = e.botTurn();
  assert.deepEqual(Object.keys(turn.context).sort(), ['alignment','playerIds','roleCode','targetIds','teamSize','visiblePlayers']);
  assert.equal(chooseAction({ actorId: 2, type: 'FINISHED', context: {} }), null);
  assert.equal(chooseAction(null), null);
  const c = { playerIds: [1,2,3,4,5], teamSize: 3, alignment: 'GOOD' };
  const action = chooseAction({ actorId: 2, type: 'TEAM', context: c }, rng(2));
  assert.equal(action.team.length, 3); assert.ok(action.team.includes(2)); assert.equal(new Set(action.team).size, 3);
  assert.equal(chooseAction({ actorId: 2, type: 'MISSION', context: c }, () => 0).choice, 'SUCCESS');
});
test('200 seeded complete games have no bot stall, work with both human/bot assassins, and never exceed five missions', () => {
  let humanAssassinations = 0, botAssassinations = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const e = game(seed, false), random = rng(seed * 37); let count = 0;
    while (e.getView().game.phase !== 'FINISHED' && count++ < 300) {
      const turn = e.botTurn();
      if (turn) {
        if (turn.type === 'ASSASSINATE') botAssassinations++;
        e.dispatch(chooseAction(turn, random), turn.revision); continue;
      }
      const v = e.getView(), g = v.game; let action;
      if (g.phase === 'ROLE_CONFIRM') action = { type: 'CONFIRM' };
      if (g.phase === 'TEAM_BUILDING') action = { type: 'TEAM', team: [1,2,3,4,5].slice(0, g.requiredTeamSize) };
      if (g.phase === 'TEAM_VOTING') action = { type: 'VOTE', choice: 'APPROVE' };
      if (g.phase === 'MISSION_EXECUTING') action = { type: 'MISSION', choice: 'SUCCESS' };
      if (g.phase === 'ASSASSINATION') { humanAssassinations++; action = { type: 'ASSASSINATE', targetId: v.room.players.find(p => !g.revealedEvilIdentities.some(r => r.playerId === p.playerId)).playerId }; }
      assert.ok(action, `stalled at seed ${seed}: ${g.phase}`); e.dispatch({ ...action, actorId: 1 });
    }
    assert.ok(count < 300); assert.equal(e.getView().game.phase, 'FINISHED'); assert.ok(e.getView().timeline.missions.length <= 5);
  }
  assert.ok(humanAssassinations > 0); assert.ok(botAssassinations > 0);
});
test('disposing in any gameplay phase cancels future bot actions and blocks stale dispatch', () => {
  for (const phase of ['ROLE_CONFIRM','TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','ASSASSINATION','FINISHED']) {
    const e = game(42, phase !== 'ROLE_CONFIRM');
    if (['TEAM_VOTING','MISSION_EXECUTING'].includes(phase)) submit(e);
    if (phase === 'MISSION_EXECUTING') vote(e);
    if (['ASSASSINATION','FINISHED'].includes(phase)) for (let i=0;i<3;i++) mission(e);
    if (phase === 'FINISHED') e.dispatch({ type:'END', actorId:1 });
    assert.equal(e.getView().game.phase,phase); const before=e.getView(); e.dispose();
    assert.equal(e.botTurn(),null); assert.throws(()=>e.dispatch({type:'CONFIRM',actorId:1})); assert.deepEqual(e.getView(),before);
  }
});
test('all six configuration pages match Java team sizes/failure thresholds and existing role parity', () => {
  const java = fs.readFileSync(path.join(__dirname,'../../backend/src/main/java/com/avalon/game/game/GameRuleConfig.java'),'utf8');
  for (const n of [5,6,7,8,9,10]) {
    const c = configuration(n);
    const match = java.match(new RegExp(`new GameRuleConfig\\(${n}, List\\.of\\([\\s\\S]*?\\),\\s*List\\.of\\(([^)]+)\\),\\s*List\\.of\\(([^)]+)\\),\\s*5,\\s*(true|false)`));
    assert.ok(match); const nums = value => value.split(',').map(Number);
    assert.deepEqual(c.teamSizes,nums(match[1])); assert.deepEqual(c.tasks.map(t=>t.fails),nums(match[2]));
    assert.equal(c.lady, match[3]==='true'); assert.equal(c.roles.reduce((sum,r)=>sum+r.quantity,0),n);
  }
});
