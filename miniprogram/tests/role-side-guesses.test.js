const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../utils/role-guesses');
const ui = require('../utils/presentation');
const context = (n, viewerRole, visiblePlayers = []) => ({ playerCount: n, viewerPlayerId: 1, viewerRole,
  visiblePlayers, players: Array.from({length:n}, (_,i) => ({playerId:i+1,seatNo:i+1})) });
const sides = ['GOOD_SIDE', 'EVIL_SIDE'];
const moon = playerId => ({playerId,knowledgeType:'EVIL'});
const ally = (playerId,roleCode) => ({playerId,roleCode,knowledgeType:'EVIL_ALLY'});
const pair = [2,3].map(playerId => ({playerId,knowledgeType:'MERLIN_OR_MORGANA'}));
const ordinary = ['MORGANA','ASSASSIN','MINION','MORDRED'];

for (const n of [5,6,7,8,9,10]) {
  for (const code of sides) test(`${n} players: unlimited ${code} notes consume no concrete or side capacity`, () => {
    const c = context(n,'LOYAL_SERVANT'), original = d.remainingRoleCounts(c);
    let g = {};
    for (let id=2; id<=n; id++) g = d.applyGuess(c,g,id,code);
    assert.equal(Object.keys(g).length,n-1);
    assert.deepEqual(d.sanitizeGuesses(c,g),g);
    assert.deepEqual(d.remainingRoleCounts(c,g),original);
    assert.equal(Object.hasOwn(d.remainingRoleCounts(c,g),code),false);
    for (let id=2; id<=n; id++) {
      assert.deepEqual(d.guessCandidates(c,id,g),d.guessCandidates(c,id));
      for (const role of ['MERLIN','MORGANA','ASSASSIN']) assert.ok(d.guessCandidates(c,id,g).includes(role));
    }
  });
  test(`${n} Merlin moon: neither side can override system evil knowledge`, () => {
    const c = context(n,'MERLIN',[moon(2)]);
    assert.deepEqual(d.possibleAlignmentsForTarget(c,2),['EVIL']);
    assert.deepEqual(d.sideCandidates(c,2),[]);
    assert.deepEqual(d.markCandidates(c,2),d.guessCandidates(c,2));
    for (const code of sides) {
      assert.deepEqual(d.applyGuess(c,{},2,code),{});
      assert.deepEqual(d.sanitizeGuesses(c,{2:code}),{});
    }
  });
  test(`${n} Merlin nonmoon: blue always available, red requires hidden Mordred`, () => {
    const c = context(n,'MERLIN',[moon(2)]);
    assert.deepEqual(d.possibleAlignmentsForTarget(c,3),n>=9?['GOOD','EVIL']:['GOOD']);
    assert.deepEqual(d.sideCandidates(c,3),n>=9?sides:['GOOD_SIDE']);
    assert.ok(d.markCandidates(c,3).includes('GOOD_SIDE'));
    assert.equal(d.markCandidates(c,3).includes('EVIL_SIDE'),n>=9);
    assert.equal(d.markCandidates(c,3).includes('MORDRED'),n>=9);
  });
  for (const role of ordinary.filter(role => ui.roleConfig(n)[role]))
    test(`${n} ${role}: unknown side depends on Oberon, never Mordred or role capacity`, () => {
      const config = ui.roleConfig(n);
      const known = ordinary.filter(r=>r!==role && config[r]).map((r,i)=>ally(i+2,r));
      const c = context(n,role,known), target = n;
      const expected = config.OBERON?sides:['GOOD_SIDE'];
      assert.deepEqual(d.possibleAlignmentsForTarget(c,target),config.OBERON?['GOOD','EVIL']:['GOOD']);
      assert.deepEqual(d.sideCandidates(c,target),expected);
      assert.deepEqual(d.guessCandidates(c,target),['MERLIN','PERCIVAL','LOYAL_SERVANT',...(config.OBERON?['OBERON']:[])]);
      assert.deepEqual(d.markCandidates(c,target).filter(code=>sides.includes(code)),expected);
      for (const id of [1,...known.map(p=>p.playerId)]) {
        assert.deepEqual(d.possibleAlignmentsForTarget(c,id),[]);
        assert.deepEqual(d.sideCandidates(c,id),[]);
      }
      // Missing ally entries must not turn a non-Oberon evil role into an unknown alignment possibility.
      assert.deepEqual(d.sideCandidates(context(n,role),target),expected);
    });
}
test('seven-player assassin unknown target offers good roles, Oberon and both side codes', () => {
  const c = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  assert.deepEqual(d.markCandidates(c,3),['MERLIN','PERCIVAL','LOYAL_SERVANT','OBERON',...sides]);
  for (const id of [1,2,99]) assert.deepEqual(d.markCandidates(c,id),[]);
});
test('system-good targets allow only blue; concrete allocations cannot remove mixed side options', () => {
  const c = context(8,'ASSASSIN',[ally(2,'MORGANA'),ally(3,'MINION')]);
  assert.deepEqual(d.markCandidates(c,4),['MERLIN','PERCIVAL','LOYAL_SERVANT','GOOD_SIDE']);
  assert.deepEqual(d.sanitizeGuesses(c,{4:'GOOD_SIDE',5:'EVIL_SIDE'}),{4:'GOOD_SIDE'});
  const seven = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  const g = d.applyGuess(seven,{4:'EVIL_SIDE',5:'GOOD_SIDE'},3,'OBERON');
  assert.deepEqual(g,{3:'OBERON',4:'EVIL_SIDE',5:'GOOD_SIDE'});
  assert.deepEqual(d.markCandidates(seven,4,g),['MERLIN','PERCIVAL','LOYAL_SERVANT',...sides]);
});
test('system knowledge changes reconcile illegal sides without losing valid concrete notes', () => {
  const c = context(10,'MERLIN');
  const original = {2:'EVIL_SIDE',3:'GOOD_SIDE',4:'MORDRED',5:'PERCIVAL'};
  const mixed = {2:'EVIL_SIDE',3:'GOOD_SIDE',5:'PERCIVAL'};
  assert.deepEqual(d.sanitizeGuesses(c,mixed),mixed);
  assert.deepEqual(d.sanitizeGuesses({...c,visiblePlayers:[moon(2)]},mixed),{3:'GOOD_SIDE',5:'PERCIVAL'});
  assert.deepEqual(d.sanitizeGuesses(c,original),original);
  assert.deepEqual(original,{2:'EVIL_SIDE',3:'GOOD_SIDE',4:'MORDRED',5:'PERCIVAL'});
});
test('Percival pair never accepts side codes; swap and clear remain complementary and atomic', () => {
  const c = context(7,'PERCIVAL',pair);
  let g = d.applyGuess(c,{},2,'MERLIN');
  for (const id of [2,3]) {
    assert.deepEqual(d.possibleAlignmentsForTarget(c,id),['GOOD','EVIL']);
    assert.deepEqual(d.sideCandidates(c,id),[]);
    assert.deepEqual(d.markCandidates(c,id,g),['MERLIN','MORGANA']);
    for (const code of sides) assert.deepEqual(d.applyGuess(c,g,id,code),g);
    assert.deepEqual(d.clearGuess(c,g,id),{});
  }
  assert.deepEqual(d.sanitizeGuesses(c,{2:'GOOD_SIDE',3:'EVIL_SIDE',4:'ASSASSIN'}),{4:'ASSASSIN'});
  g = d.applyGuess(c,g,3,'MERLIN');
  assert.deepEqual(g,{2:'MORGANA',3:'MERLIN'});
  assert.ok(d.markCandidates(c,4,g).includes('GOOD_SIDE'));
  assert.deepEqual(d.sideCandidates(c,4),sides);
});

for (const n of [7,10]) test(`${n} Oberon: both side candidates without another concrete Oberon`, () => {
  const c = context(n,'OBERON');
  assert.deepEqual(d.possibleAlignmentsForTarget(c,2),['GOOD','EVIL']);
  assert.deepEqual(d.sideCandidates(c,2),sides);
  assert.ok(!d.guessCandidates(c,2).includes('OBERON'));
});
for (const [alignment,notes] of [
  ['EVIL',{2:'ASSASSIN',3:'MORGANA',4:'OBERON'}],
  ['GOOD',{2:'MERLIN',3:'PERCIVAL',4:'LOYAL_SERVANT'}],
]) test(`${alignment} concrete inventory exhausted: both sides still offered saved and restored`, () => {
  const c = context(7,'LOYAL_SERVANT'), raw = {...notes,5:'EVIL_SIDE',6:'GOOD_SIDE'};
  assert.deepEqual(d.sanitizeGuesses(c,raw),raw);
  const roles = d.guessCandidates(c,7,raw);
  assert.ok(roles.every(role=>(['MORGANA','ASSASSIN','OBERON'].includes(role)?'EVIL':'GOOD')!==alignment));
  assert.deepEqual(d.markCandidates(c,7,raw),[...roles,...sides]);
  const result = d.applyGuess(c,raw,7,alignment==='GOOD'?'GOOD_SIDE':'EVIL_SIDE');
  assert.equal(result[7],alignment==='GOOD'?'GOOD_SIDE':'EVIL_SIDE');
  assert.equal(result[5],'EVIL_SIDE');assert.equal(result[6],'GOOD_SIDE');
  assert.deepEqual(d.remainingRoleCounts(c,result),d.remainingRoleCounts(c,notes));
  assert.deepEqual(d.loadGuesses('saved',c,{getStorageSync:()=>({guesses:result})}),result);
});
test('all allowed concrete slots exhausted: a target can still have a side-only dialog', () => {
  const ten = context(10,'MERLIN');
  const notes = {2:'MORDRED',3:'PERCIVAL',4:'LOYAL_SERVANT',5:'LOYAL_SERVANT',6:'LOYAL_SERVANT',7:'LOYAL_SERVANT'};
  assert.deepEqual(d.guessCandidates(ten,8,notes),[]);
  assert.deepEqual(d.markCandidates(ten,8,notes),sides);
  const next = d.applyGuess(ten,notes,8,'EVIL_SIDE');
  assert.equal(next[8],'EVIL_SIDE');
  assert.deepEqual(d.remainingRoleCounts(ten,next),d.remainingRoleCounts(ten,notes));
});
test('reconciliation only removes sides made illegal by system knowledge, never personal inventory', () => {
  const c = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  const notes = {3:'EVIL_SIDE',4:'GOOD_SIDE',5:'OBERON'};
  assert.deepEqual(d.sanitizeGuesses(c,notes),notes);
  assert.deepEqual(d.sanitizeGuesses({...c,visiblePlayers:[ally(2,'MORGANA'),ally(3,'ASSASSIN')]},notes),{4:'GOOD_SIDE',5:'OBERON'});
  const merlin = context(7,'MERLIN');
  assert.deepEqual(d.sanitizeGuesses(merlin,{2:'GOOD_SIDE',3:'EVIL_SIDE'}),{2:'GOOD_SIDE'});
  assert.deepEqual(d.sanitizeGuesses({...merlin,visiblePlayers:[moon(2)]},{2:'GOOD_SIDE'}),{});
});
test('system alignment helpers fail closed on invalid self exact missing and incomplete pair contexts', () => {
  const c = context(7,'LOYAL_SERVANT');
  for (const invalid of [null,undefined,{}, {...c,viewerRole:'UNKNOWN'}, {...c,players:[]},context(7,'PERCIVAL')]) {
    assert.deepEqual(d.possibleAlignmentsForTarget(invalid,2),[]);
    assert.deepEqual(d.sideCandidates(invalid,2),[]);
  }
  for (const id of [1,0,99,'2']) assert.deepEqual(d.sideCandidates(c,id),[]);
});
test('invalid or incomplete context rejects side guesses just like concrete guesses', () => {
  const c = context(7,'LOYAL_SERVANT');
  for (const altered of [{...c,viewerRole:'UNKNOWN'},{...c,players:[]},context(7,'PERCIVAL')])
    assert.deepEqual(d.sanitizeGuesses(altered,{2:'EVIL_SIDE'}),{});
  assert.deepEqual(d.sanitizeGuesses(c,{1:'GOOD_SIDE',99:'EVIL_SIDE','02':'GOOD_SIDE',2:'RED_SIDE'}),{});
});
test('V1 storage restores old concrete and new side notes together without schema/version changes', () => {
  const c = context(7,'LOYAL_SERVANT'), values = new Map();
  const storage = {getStorageSync:k=>values.get(k),setStorageSync:(k,v)=>values.set(k,v),removeStorageSync:k=>values.delete(k)};
  const key = d.storageKey(42,1), notes = {2:'MERLIN',3:'GOOD_SIDE',4:'EVIL_SIDE',5:'OBERON'};
  values.set(key,{guesses:notes});
  assert.deepEqual(d.loadGuesses(key,c,storage),notes);
  assert.equal(d.saveGuesses(key,notes,storage),true);
  assert.deepEqual(values.get(key),{guesses:notes});
  assert.equal(key,'AVALON_ROLE_GUESSES_V1:42:1');
});
test('flat options order and blue/red tones include only permitted roles, no invented roles', () => {
  const c = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  assert.deepEqual(d.candidateOptions(d.markCandidates(c,3)),[
    {roleCode:'MERLIN',name:'梅林',tone:'good'},
    {roleCode:'PERCIVAL',name:'派西维尔',tone:'good'},
    {roleCode:'LOYAL_SERVANT',name:'忠臣',tone:'good'},
    {roleCode:'GOOD_SIDE',name:'蓝方',tone:'good'},
    {roleCode:'OBERON',name:'奥伯伦',tone:'evil'},
    {roleCode:'EVIL_SIDE',name:'红方',tone:'evil'},
  ]);
  assert.deepEqual(d.candidateOptions(['OBERON','MORGANA','ASSASSIN']).map(p=>p.roleCode),['ASSASSIN','MORGANA','OBERON']);
  assert.equal(ui.ROLE_NAMES.GOOD_SIDE,undefined);
  assert.equal(ui.roleConfig(7).EVIL_SIDE,undefined);
});
for (const [code,text,tone] of [['GOOD_SIDE','蓝','blue'],['EVIL_SIDE','红','evil']]) {
  test(`${code}: personal letter-only GUESS never becomes knowledge or exact role`, () => {
    assert.deepEqual(d.displayIdentityMark({},code,'TEAM_BUILDING'),{markType:'GUESS',markText:text,markClass:tone});
    for (const player of [{me:true},{markType:'ROLE'},{revealedEvil:true}])
      assert.deepEqual(d.displayIdentityMark(player,code,'TEAM_BUILDING'),{});
    for (const phase of ['WAITING','ROLE_CONFIRM','ASSASSINATION','FINISHED'])
      assert.deepEqual(d.displayIdentityMark({},code,phase),{});
  });
}
