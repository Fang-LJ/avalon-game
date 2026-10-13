const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const d = require('../utils/role-guesses');
const ui = require('../utils/presentation');
const roles = Object.keys(ui.ROLE_NAMES);
const evil = ['MORGANA', 'ASSASSIN', 'MINION', 'MORDRED', 'OBERON'];
const ordinary = evil.filter(r => r !== 'OBERON');
const sorted = xs => [...xs].sort();
function context(n, role, visiblePlayers = []) {
  return { playerCount: n, viewerPlayerId: 1, viewerRole: role, visiblePlayers,
    players: Array.from({ length: n }, (_, i) => ({ playerId: i + 1, seatNo: i + 1 })) };
}
const evilKnowledge = playerId => ({ playerId, knowledgeType: 'EVIL' });
const pair = [2,3].map(playerId => ({ playerId, knowledgeType: 'MERLIN_OR_MORGANA' }));
const ally = (playerId, roleCode) => ({ playerId, roleCode, knowledgeType: 'EVIL_ALLY' });

for (let n = 5; n <= 10; n++) {
  test(`${n} player public role composition matches unchanged backend source`, () => {
    const java = fs.readFileSync(path.join(__dirname, '../../backend/src/main/java/com/avalon/game/game/GameRuleConfig.java'), 'utf8');
    const match = java.match(new RegExp(`new GameRuleConfig\\(${n}, List\\.of\\(([\\s\\S]*?)\\),\\s*List\\.of`));
    assert.ok(match);
    const counts = {};
    for (const [, role] of match[1].matchAll(/Role\.([A-Z_]+)/g)) counts[role] = (counts[role] || 0) + 1;
    assert.deepEqual(ui.roleConfig(n), counts);
    assert.equal(Object.values(counts).reduce((a,b) => a+b), n);
    assert.equal(ui.rules(n).good, counts.LOYAL_SERVANT + 2);
    const copy = ui.roleConfig(n); copy.MERLIN = 100;
    assert.equal(ui.roleConfig(n).MERLIN, 1);
  });
  for (const role of roles.filter(r => ui.roleConfig(n)[r])) test(`${n} ${role}: self cannot be guessed and consumes exact capacity`, () => {
    const c = context(n, role, role === 'PERCIVAL' ? pair : []);
    assert.deepEqual(d.guessCandidates(c, 1), []);
    assert.equal(d.remainingRoleCounts(c)[role], ui.roleConfig(n)[role] - 1);
    assert.deepEqual(d.applyGuess(c, {}, 1, 'MERLIN'), {});
  });
  test(`${n} Merlin: known-evil and unmarked candidates obey system facts`, () => {
    const c = context(n, 'MERLIN', [evilKnowledge(2)]);
    assert.deepEqual(sorted(d.guessCandidates(c, 2)), sorted(evil.filter(r => r !== 'MORDRED' && ui.roleConfig(n)[r])));
    assert.deepEqual(sorted(d.guessCandidates(c, 3)), sorted(['PERCIVAL','LOYAL_SERVANT', ...(n >= 9 ? ['MORDRED'] : [])]));
    assert.equal(d.guessCandidates(c,2).includes('MERLIN'), false);
    assert.equal(d.guessCandidates(c,2).includes('MORDRED'), false);
    assert.equal(d.guessCandidates(c,3).includes('OBERON'), false);
    // An evil system mark is ambiguous knowledge, not a known exact role/capacity allocation.
    assert.equal(d.remainingRoleCounts(c).MORGANA, 1);
  });
  test(`${n} loyal servant duplicates stop at public capacity minus own identity`, () => {
    const c = context(n, 'LOYAL_SERVANT'); let guesses = {};
    const remaining = ui.roleConfig(n).LOYAL_SERVANT - 1;
    for (let i = 0; i < remaining; i++) guesses = d.applyGuess(c, guesses, i + 2, 'LOYAL_SERVANT');
    assert.equal(Object.keys(guesses).length, remaining);
    assert.equal(d.guessCandidates(c, n, guesses).includes('LOYAL_SERVANT'), false);
    if (remaining) {
      assert.equal(d.guessCandidates(c, 2, guesses).includes('LOYAL_SERVANT'), true);
      guesses = d.clearGuess(c, guesses, 2);
      assert.equal(d.guessCandidates(c, n, guesses).includes('LOYAL_SERVANT'), true);
    }
  });
}

for (const role of ordinary) test(`${role}: exact evil allies locked and unknown roles exclude all exact allocations`, () => {
  const n = role === 'MINION' ? 8 : 10;
  const allies = ordinary.filter(r => r !== role && ui.roleConfig(n)[r]).map((r,i) => ally(i+2, r));
  const c = context(n, role, allies);
  for (const p of allies) {
    assert.deepEqual(d.guessCandidates(c, p.playerId), []);
    assert.deepEqual(d.applyGuess(c, {}, p.playerId, 'MERLIN'), {});
    assert.equal(d.remainingRoleCounts(c)[p.roleCode], 0);
  }
  assert.deepEqual(sorted(d.guessCandidates(c, 5)), sorted(['MERLIN','PERCIVAL','LOYAL_SERVANT', ...(n === 10 ? ['OBERON'] : [])]));
});
test('7 player assassin: OBERON slot consumed, editing releases it, clearing restores it', () => {
  const c = context(7, 'ASSASSIN', [ally(2,'MORGANA')]);
  assert.deepEqual(sorted(d.guessCandidates(c,3)), sorted(['MERLIN','PERCIVAL','LOYAL_SERVANT','OBERON']));
  let g = d.applyGuess(c, {}, 3, 'OBERON');
  assert.equal(d.guessCandidates(c,4,g).includes('OBERON'), false);
  assert.equal(d.guessCandidates(c,3,g).includes('OBERON'), true);
  assert.deepEqual(d.applyGuess(c,g,4,'OBERON'), g);
  g = d.clearGuess(c,g,3);
  assert.equal(d.guessCandidates(c,4,g).includes('OBERON'), true);
});
for (const n of [7,10]) test(`${n} Oberon: no allies assumed, own slot consumed naturally`, () => {
  const c = context(n, 'OBERON');
  assert.deepEqual(sorted(d.guessCandidates(c,2)), sorted(Object.keys(ui.roleConfig(n)).filter(r => r !== 'OBERON')));
  assert.equal(d.remainingRoleCounts(c).OBERON, 0);
  assert.deepEqual(d.sanitizeGuesses(c, {2:'OBERON',3:'ASSASSIN'}), {3:'ASSASSIN'});
});

test('Percival pair selection, flip and clearing are atomic and capacity is reserved', () => {
  const c = context(7,'PERCIVAL',pair);
  for (const id of [2,3]) assert.deepEqual(sorted(d.guessCandidates(c,id)), ['MERLIN','MORGANA']);
  let g = d.applyGuess(c, {}, 2, 'MERLIN');
  assert.deepEqual(g, {2:'MERLIN',3:'MORGANA'});
  assert.deepEqual(sorted(d.guessCandidates(c,2,g)), ['MERLIN','MORGANA']);
  g = d.applyGuess(c,g,3,'MERLIN');
  assert.deepEqual(g, {2:'MORGANA',3:'MERLIN'});
  for (const id of [2,3]) assert.deepEqual(d.clearGuess(c,g,id), {});
  for (const notes of [{},g,d.clearGuess(c,g,2)]) {
    const others = d.guessCandidates(c,4,notes);
    assert.equal(others.includes('MERLIN'), false);
    assert.equal(others.includes('MORGANA'), false);
    assert.equal(others.includes('PERCIVAL'), false);
    assert.equal(d.remainingRoleCounts(c,notes).MERLIN,0);
    assert.equal(d.remainingRoleCounts(c,notes).MORGANA,0);
  }
  assert.deepEqual(d.sanitizeGuesses(c,{2:'MERLIN'}),{});
  assert.deepEqual(d.sanitizeGuesses(c,{2:'MERLIN',3:'MERLIN',4:'MORGANA'}),{});
  assert.deepEqual(d.sanitizeGuesses(c,g),g);
  assert.deepEqual(d.applyGuess(c,g,2,'ASSASSIN'),g);
});
test('incomplete or duplicate Percival response fails closed instead of inferring leaked identities', () => {
  for (const visible of [[],pair.slice(0,1),[pair[0],pair[0]],[...pair,{playerId:4,knowledgeType:'MERLIN_OR_MORGANA'}]]) {
    const c = context(7,'PERCIVAL',visible);
    assert.deepEqual(d.guessCandidates(c,2),[]);
    assert.deepEqual(d.sanitizeGuesses(c,{2:'MERLIN'}),{});
  }
});
test('sanitizer rejects absent roles, self, exact facts, removed players and overflow slots', () => {
  const c = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  assert.deepEqual(d.sanitizeGuesses(c,{1:'MERLIN',2:'LOYAL_SERVANT',3:'MERLIN',4:'MERLIN',5:'MINION',99:'OBERON',6:'OBERON',7:'MORDRED','03':'ASSASSIN'}),{3:'MERLIN',6:'OBERON'});
  for (const raw of [null,1,'x',[],{2:'UNKNOWN'}]) assert.deepEqual(d.sanitizeGuesses(c,raw),{});
  const duplicate = {...c,players:[...c.players,c.players[0],c.players[1]]};
  assert.deepEqual(d.remainingRoleCounts(duplicate),d.remainingRoleCounts(c));
  assert.deepEqual(d.sanitizeGuesses({...c,viewerRole:'UNKNOWN'},{3:'MERLIN'}),{});
  assert.deepEqual(d.sanitizeGuesses({...c,players:[]},{3:'MERLIN'}),{});
});
test('corrupted saved facts cannot override Merlin exclusions or newer exact evil knowledge', () => {
  assert.deepEqual(d.sanitizeGuesses(context(10,'MERLIN',[evilKnowledge(2)]),{2:'MORDRED',3:'OBERON',4:'MORDRED'}),{4:'MORDRED'});
  const notes = {2:'MERLIN',3:'OBERON'};
  assert.deepEqual(d.sanitizeGuesses(context(7,'ASSASSIN',[ally(2,'MORGANA')]),notes),{3:'OBERON'});
  assert.deepEqual(notes,{2:'MERLIN',3:'OBERON'});
});
for (const role of roles) test(`${role} personal mark supplies only the role letter and never replaces exact/system public identity`, () => {
  const mark = d.displayIdentityMark({}, role, 'TEAM_BUILDING');
  assert.equal(mark.markType,'GUESS'); assert.equal(mark.markText, ui.ROLE_MARKS[role][0]);
  assert.equal(mark.markClass,ui.ROLE_MARKS[role][1]);
  for (const p of [{me:true},{markType:'ROLE'},{revealedEvil:true}]) assert.deepEqual(d.displayIdentityMark(p,role,'TEAM_BUILDING'),{});
});
for (const phase of ['WAITING','ROLE_CONFIRM','ASSASSINATION','FINISHED','UNKNOWN']) test(`${phase} renderer independently rejects guesses even without deletion`, () => {
  assert.equal(d.allowedPhase(phase),false);
  assert.deepEqual(d.displayIdentityMark({},'OBERON',phase),{});
});
for (const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE']) test(`${phase} permits private notes`, () => assert.equal(d.allowedPhase(phase),true));
test('storage isolates game and player IDs, writes only guesses and survives storage failures', () => {
  assert.equal(d.storageKey(42,7),'AVALON_ROLE_GUESSES_V1:42:7');
  assert.notEqual(d.storageKey(42,7),d.storageKey(43,7));
  assert.notEqual(d.storageKey(42,7),d.storageKey(42,8));
  for (const id of [null,0,-1,'42',NaN,Infinity,1.2]) assert.equal(d.storageKey(id,7),'');
  const values = new Map(), storage = { getStorageSync:k => values.get(k), setStorageSync:(k,v)=>values.set(k,v),removeStorageSync:k=>values.delete(k) };
  const key = d.storageKey(42,7), c = context(7,'LOYAL_SERVANT');
  assert.equal(d.saveGuesses(key,{2:'MERLIN'},storage),true);
  assert.deepEqual(values.get(key),{guesses:{2:'MERLIN'}});
  assert.deepEqual(d.loadGuesses(key,c,storage),{2:'MERLIN'});
  assert.equal(d.saveGuesses(key,{},storage),true); assert.equal(values.has(key),false);
  const broken = new Proxy({}, {get(){return()=>{throw new Error('full/unavailable');};}});
  assert.deepEqual(d.loadGuesses(key,c,broken),{});
  assert.equal(d.saveGuesses(key,{2:'MERLIN'},broken),false);
  assert.doesNotThrow(()=>d.removeGuesses(key,broken));
});
