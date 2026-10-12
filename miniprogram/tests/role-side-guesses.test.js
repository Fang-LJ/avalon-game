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
    assert.deepEqual(d.markCandidates(c,2),d.guessCandidates(c,2));
    for (const code of sides) {
      assert.deepEqual(d.applyGuess(c,{},2,code),{});
      assert.deepEqual(d.sanitizeGuesses(c,{2:code}),{});
    }
  });
  test(`${n} Merlin nonmoon: side options require a hidden Mordred possibility`, () => {
    const c = context(n,'MERLIN',[moon(2)]);
    for (const code of sides) assert.equal(d.markCandidates(c,3).includes(code),n>=9);
    assert.equal(d.markCandidates(c,3).includes('MORDRED'),n>=9);
  });
}
test('seven-player assassin unknown target offers good roles, Oberon and both side codes', () => {
  const c = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  assert.deepEqual(d.markCandidates(c,3),['MERLIN','PERCIVAL','LOYAL_SERVANT','OBERON',...sides]);
  for (const id of [1,2,99]) assert.deepEqual(d.markCandidates(c,id),[]);
});
test('known exact allocations or concrete capacity leaving one alignment remove side options', () => {
  const c = context(8,'ASSASSIN',[ally(2,'MORGANA'),ally(3,'MINION')]);
  assert.deepEqual(d.markCandidates(c,4),['MERLIN','PERCIVAL','LOYAL_SERVANT']);
  assert.deepEqual(d.sanitizeGuesses(c,{4:'GOOD_SIDE',5:'EVIL_SIDE'}),{});
  const seven = context(7,'ASSASSIN',[ally(2,'MORGANA')]);
  const g = d.applyGuess(seven,{4:'EVIL_SIDE',5:'GOOD_SIDE'},3,'OBERON');
  assert.deepEqual(g,{3:'OBERON'});
  assert.deepEqual(d.markCandidates(seven,4,g),['MERLIN','PERCIVAL','LOYAL_SERVANT']);
});
test('system knowledge changes reconcile illegal sides without losing valid concrete notes', () => {
  const c = context(10,'MERLIN');
  const original = {2:'EVIL_SIDE',3:'GOOD_SIDE',4:'MORDRED',5:'PERCIVAL'};
  // Use a context without the Mordred slot already guessed for mixed side notes.
  const mixed = {2:'EVIL_SIDE',3:'GOOD_SIDE',5:'PERCIVAL'};
  assert.deepEqual(d.sanitizeGuesses(c,mixed),mixed);
  assert.deepEqual(d.sanitizeGuesses({...c,visiblePlayers:[moon(2)]},mixed),{3:'GOOD_SIDE',5:'PERCIVAL'});
  assert.deepEqual(d.sanitizeGuesses(c,original),{4:'MORDRED',5:'PERCIVAL'});
  assert.deepEqual(original,{2:'EVIL_SIDE',3:'GOOD_SIDE',4:'MORDRED',5:'PERCIVAL'});
});
test('Percival pair never accepts side codes; swap and clear remain complementary and atomic', () => {
  const c = context(7,'PERCIVAL',pair);
  let g = d.applyGuess(c,{},2,'MERLIN');
  for (const id of [2,3]) {
    assert.deepEqual(d.markCandidates(c,id,g),['MERLIN','MORGANA']);
    for (const code of sides) assert.deepEqual(d.applyGuess(c,g,id,code),g);
    assert.deepEqual(d.clearGuess(c,g,id),{});
  }
  assert.deepEqual(d.sanitizeGuesses(c,{2:'GOOD_SIDE',3:'EVIL_SIDE',4:'ASSASSIN'}),{4:'ASSASSIN'});
  g = d.applyGuess(c,g,3,'MERLIN');
  assert.deepEqual(g,{2:'MORGANA',3:'MERLIN'});
  assert.ok(d.markCandidates(c,4,g).includes('GOOD_SIDE'));
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
