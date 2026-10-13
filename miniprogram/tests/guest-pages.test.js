const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { ROUTES, ROLES } = require('../utils/guest-content');
function fixture(name = 'demo-room', { pages = [{}], random = Math.random } = {}) {
  let page, modal; const timers = new Map(), callbacks = [], calls = []; let serial = 0;
  const fail = operation => () => { throw Error(`Guest attempted ${operation}`); };
  const wx = { login: fail('login'), request: fail('network request'), connectSocket: fail('WebSocket'),
    setStorageSync: fail('storage write'), getStorageSync: fail('token read'), removeStorageSync: fail('storage delete'),
    getUserProfile: fail('WeChat identity'), getWindowInfo: () => ({ statusBarHeight: 47 }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 79 }), showModal: value => { modal = value; },
    navigateBack: () => calls.push('back'), reLaunch: o => calls.push(o.url), navigateTo: o => calls.push(o.url) };
  const math = Object.create(Math); math.random = random;
  const cache = new Map();
  function load(file) {
    if(cache.has(file))return cache.get(file).exports;
    const module = {exports:{}};cache.set(file,module);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,Math:math,wx,getCurrentPages:()=>pages,require:request=>{
      assert.doesNotMatch(request,/services|socket|token|request|auth/);
      return load(path.resolve(path.dirname(file),request+'.js'));
    }});
    return module.exports;
  }
  const source = fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8');
  vm.runInNewContext(source, { Page: p => { page = p; }, wx, getCurrentPages: () => pages,
    require: request => {
      assert.doesNotMatch(request, /services|socket|token|request|auth/);
      return load(path.resolve(root, `pages/${name}`, request + '.js'));
    },
    setTimeout: callback => { const id = ++serial; timers.set(id, callback); callbacks.push(callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const renders = [];
  page.data = structuredClone(page.data); page.setData = value => { Object.assign(page.data, JSON.parse(JSON.stringify(value))); renders.push(structuredClone(page.data)); };
  page.onLoad?.(); page.onShow?.();
  const tick = () => { const [id, fn] = timers.entries().next().value || []; if (fn) { timers.delete(id); fn(); return true; } return false; };
  const drain = () => { for (let i = 0; i < 20 && tick(); i++); assert.ok(timers.size <= 1); };
  return { page, renders, wx, timers, callbacks, calls, tick, drain, modal: () => modal };
}
function playing() {
  const f = fixture(); f.drain();
  f.page.confirmRole({ detail: { gameId: f.page.data.game.gameId } }); return f;
}
for (const name of ['guide','roles','configuration','demo-room']) test(`${name} loads without a token or auth/network/storage/identity access`, () => {
  const f = fixture(name);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(manifest.pages.includes(`pages/${name}/${name}`));
  if (name !== 'demo-room') { f.page.back(); assert.deepEqual(f.calls, ['/pages/login/login']); }
  else { assert.equal(f.page.data.room.currentPlayers, 5); assert.equal(f.page.data.game.phase, 'ROLE_CONFIRM'); f.page.onUnload(); }
});
test('every login module navigates independently of the login button, even while session checking is pending', () => {
  let page; const calls = [], authentication = [];
  vm.runInNewContext(fs.readFileSync(path.join(root,'pages/login/login.js'),'utf8'), {
    Page: p => { page = p; }, wx: { navigateTo: o => calls.push(o.url) },
    require: request => request.includes('services/auth') ? { login: () => authentication.push('login') }
      : request.includes('utils/invite') ? {} : require(path.resolve(root,'pages/login',request)),
  });
  page.data = structuredClone(page.data); assert.equal(page.data.checking, true);
  for (const key of Object.keys(ROUTES)) page.openGuestFeature({ currentTarget: { dataset: { key } } });
  assert.deepEqual(calls, Object.values(ROUTES)); assert.deepEqual(authentication, []);
});
test('role browser uses existing eight card URLs and can close the enlarged card without authorization', () => {
  const f = fixture('roles'); assert.equal(f.page.data.roles.length, 8);
  for (const r of ROLES) {
    assert.ok(r.card.startsWith(require('../utils/cards').CARD_BASE));
    f.page.openRole({ currentTarget: { dataset: { code: r.code } } }); assert.equal(f.page.data.selectedRole.code, r.code);
  }
  f.page.closeRole(); assert.equal(f.page.data.selectedRole, null);
});
test('player configuration updates all six counts locally and ignores invalid selection', () => {
  const f = fixture('configuration');
  for (const count of [5,6,7,8,9,10]) { f.page.choose({ currentTarget: { dataset: { count } } }); assert.equal(f.page.data.config.count,count); }
  f.page.choose({currentTarget:{dataset:{count:4}}});assert.equal(f.page.data.config.count,10);
});
test('scheduler keeps exactly one timer; hidden/unloaded pages ignore even forcibly delivered cancelled callbacks', () => {
  const f = fixture(); assert.equal(f.timers.size,1);
  f.page.syncView(); f.page.syncView(); assert.equal(f.timers.size,1);
  const callbacks=f.callbacks.slice(), engine=f.page.engine; f.page.onHide(); const before=engine.getView();
  assert.equal(f.timers.size,0); for(const callback of callbacks)callback(); assert.deepEqual(engine.getView(),before);
  f.page.onShow();assert.equal(f.timers.size,1); f.page.onUnload();assert.equal(f.timers.size,0);assert.equal(engine.isDisposed(),true);
  for(const callback of f.callbacks)callback();assert.deepEqual(engine.getView(),before);
});
test('entry publishes only a complete five-player random deal and never flashes a waiting lobby', () => {
  const f = fixture();
  assert.ok(f.renders.filter(d => d.room).every(d => d.room.currentPlayers === 5 && d.game.phase === 'ROLE_CONFIRM'));
  assert.equal(f.page.data.room.players.filter(p => p.isBot).length, 4);
  assert.equal(f.page.data.role.confirmed, false); f.page.onUnload();
});
test('exit immediately clears the engine, overlays and private state without any modal or surviving timer', () => {
  const f = playing(), engine = f.page.engine, stale = f.callbacks.slice();
  f.page.openRole(); f.page.openHistory(); f.page.exit();
  assert.equal(f.modal(), undefined); assert.equal(f.page.engine, null); assert.ok(engine.isDisposed());
  assert.equal(f.timers.size, 0); assert.equal(f.page.data.role, null); assert.equal(f.page.data.room, null);
  assert.equal(f.page.data.roleOverlay, false); assert.deepEqual(f.calls, ['/pages/login/login']);
  const before = structuredClone(f.page.data);
  for (const callback of stale) callback(); f.page.onShow();
  f.page.missionSuccess(); f.page.missionFail(); f.page.submitMission(); f.page.closeRole(); f.page.closeMission(); f.page.exit();
  assert.deepEqual(f.page.data, before);
});
test('early-assassination cancellation and backgrounding resume bots; stale modal callbacks after exit do nothing', () => {
  const f = fixture('demo-room', { random: () => 0.2 }), p = f.page;
  f.drain(); p.confirmRole({ detail: { gameId: p.data.game.gameId } });
  assert.equal(p.data.role.roleCode, 'ASSASSIN'); assert.ok(p.data.canEarlyAssassination);
  p.earlyAssassination(); assert.equal(f.timers.size, 0); assert.equal(p.data.game.phase, 'TEAM_BUILDING');
  p.onHide(); f.modal().success({ confirm: false }); p.onShow();
  assert.equal(p.confirmingAction, false);
  p.earlyAssassination(); const modal = f.modal(); p.exit(); const before = structuredClone(p.data);
  modal.success({ confirm: true }); modal.fail(); for (const cb of f.callbacks) cb();
  assert.deepEqual(p.data, before); assert.equal(f.timers.size, 0);
});
test('settlement restart replaces the engine, redeals identities and refuses every previous timer callback', () => {
  const f = playing(), old = f.page.engine, oldId = f.page.data.game.gameId, stale = f.callbacks.slice();
  old.dispatch({ type: 'END', actorId: 1 }); f.page.syncView(); f.page.restart();
  assert.notEqual(f.page.engine, old); assert.ok(old.isDisposed());
  assert.notEqual(f.page.data.game.gameId, oldId); assert.equal(f.page.data.game.phase, 'ROLE_CONFIRM');
  assert.equal(f.page.data.room.currentPlayers, 5); assert.equal(f.page.resultAck, 0);
  const before = f.page.engine.getView(), timer = f.page.botTimer;
  for (const callback of stale) callback();
  assert.equal(f.page.botTimer, timer); assert.equal(f.timers.size, 1);
  assert.deepEqual(f.page.engine.getView(), before); f.page.onUnload();
});
test('visitor projection contains no other secret identities, hidden actions or global role tables',()=>{
  const f=playing();assert.ok(f.page.data.room.players.every(p=>!p.roleCode&&!p.alignment));
  assert.ok(f.page.data.displayPlayers.every(p=>!p.roleCode&&!p.alignment));
  assert.deepEqual(f.page.data.game.identities,[]);assert.equal(f.page.data.role.roleCode,f.page.engine.getView().role.roleCode);
  assert.equal(f.page.data.engine,undefined);f.page.onUnload();
});
test('mission reveal freezes bot progression, acknowledges exactly once, and never reopens on refresh/show',()=>{
  const f=playing(), e=f.page.engine;
  if(e.getView().game.phase!=='TEAM_BUILDING') throw Error('fixture must be building');
  const leader=e.getView().game.leaderPlayerId;
  e.dispatch({type:'TEAM',actorId:leader,team:[2,3]});
  for(let id=1;id<=5;id++)e.dispatch({type:'VOTE',actorId:id,choice:'APPROVE'});
  e.dispatch({type:'MISSION',actorId:2,choice:'SUCCESS'});e.dispatch({type:'MISSION',actorId:3,choice:'SUCCESS'});f.page.syncView();
  assert.equal(f.page.data.missionResultOpen,true);assert.equal(f.timers.size,0);const before=e.getView();
  f.page.approve();assert.deepEqual(e.getView(),before);
  f.page.confirmResult({detail:{missionNo:4}});assert.equal(f.page.data.missionResultOpen,true);
  f.page.confirmResult({detail:{missionNo:1}});assert.equal(f.page.data.missionResultOpen,false);
  f.page.confirmResult({detail:{missionNo:1}});f.page.syncView();f.page.onHide();f.page.onShow();assert.equal(f.page.data.missionResultOpen,false);
  f.page.onUnload();
});
test('local finish shows all five identities grouped correctly and leaves official modules out of guest graph',()=>{
  const f=playing();f.page.engine.dispatch({type:'END',actorId:1});f.page.syncView();
  assert.equal(f.page.data.game.phase,'FINISHED');assert.equal(f.page.data.game.winner,null);
  assert.equal(f.page.data.finishedGroups.flatMap(g=>g.players).length,5);
  assert.equal(f.page.data.finishedGroups.find(g=>g.alignment==='GOOD').players.length,3);
  f.page.onUnload();
  const seen=new Set();
  function check(file){
    if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(source,/wx\.(?:login|request|connectSocket|getUserProfile|setStorageSync|removeStorageSync)|JWT/);
    for(const m of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)){
      assert.doesNotMatch(m[1],/services|socket|token|auth|request/);
      if(m[1].startsWith('.'))check(path.resolve(path.dirname(file),m[1]+'.js'));
    }
  }
  for(const n of ['guide','roles','configuration','demo-room'])check(path.join(root,`pages/${n}/${n}.js`));
});

for (const name of ['guide', 'roles', 'configuration', 'demo-room']) test(`${name} return uses the existing WeChat stack`, () => {
  const f = fixture(name, { pages: [{ route: 'pages/login/login' }, {}] });
  if (name === 'demo-room') f.page.exit(); else f.page.back();
  assert.deepEqual(f.calls, ['back']);
});
test('human assassin requires confirmation, can cancel or fail, and can select and finish a legal strike', () => {
  const f = fixture('demo-room', { random: () => 0.2 }), p = f.page; f.drain();
  p.earlyAssassination(); assert.equal(f.modal(), undefined);
  p.confirmRole({ detail: { gameId: p.data.game.gameId } });
  p.earlyAssassination(); f.modal().fail(); assert.equal(p.confirmingAction, false); assert.equal(f.timers.size, 1);
  p.earlyAssassination(); f.modal().success({ confirm: false }); assert.equal(p.data.game.phase, 'TEAM_BUILDING');
  p.earlyAssassination(); f.modal().success({ confirm: true }); assert.equal(p.data.game.phase, 'ASSASSINATION');
  assert.equal(p.data.canEarlyAssassination, false);
  p.selectSeat({ detail: { playerId: 1 } }); assert.equal(p.data.targetId, null);
  const target = p.data.room.players.find(v => !p.data.game.revealedEvilIdentities.some(e => e.playerId === v.playerId));
  p.selectSeat({ detail: { playerId: target.playerId } }); p.assassinate();
  assert.equal(p.data.game.phase, 'FINISHED'); assert.ok(p.data.game.winner); p.onUnload();
});
for (const phase of ['ROLE_CONFIRM', 'TEAM_BUILDING', 'TEAM_VOTING', 'MISSION_EXECUTING', 'ASSASSINATION', 'FINISHED'])
  test(`direct return in ${phase} disposes all bot work`, () => {
    const f = fixture('demo-room', { random: () => 0.2 }), p = f.page, e = p.engine;
    if (phase !== 'ROLE_CONFIRM') { f.drain(); p.confirmRole({ detail: { gameId: p.data.game.gameId } }); }
    if (['TEAM_VOTING', 'MISSION_EXECUTING'].includes(phase)) {
      e.dispatch({ type: 'TEAM', actorId: e.getView().game.leaderPlayerId, team: [1, 2] });
      if (phase === 'MISSION_EXECUTING') for (let id = 1; id <= 5; id++) e.dispatch({ type: 'VOTE', actorId: id, choice: 'APPROVE' });
    }
    if (phase === 'ASSASSINATION') e.dispatch({ type: 'EARLY_ASSASSINATION', actorId: 1 });
    if (phase === 'FINISHED') e.dispatch({ type: 'END', actorId: 1 });
    p.syncView(); assert.equal(p.data.game.phase, phase);
    const before = e.getView(); p.exit();
    for (const callback of f.callbacks) callback();
    assert.ok(e.isDisposed()); assert.equal(f.timers.size, 0); assert.equal(p.engine, null);
    assert.deepEqual(e.getView(), before); assert.equal(f.modal(), undefined);
  });
function seeded(seed) { let state = seed; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }
test('50 full page-driven games preserve role popup, history, team, voting, missions, results, both assassins and rematch', () => {
  const roles = new Set(), leaders = new Set(), assassins = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const f = fixture('demo-room', { random: seeded(seed * 7919) }), p = f.page;
    roles.add(p.data.role.roleCode); const reveals = new Set(); let steps = 0;
    while (p.data.game.phase !== 'FINISHED' && ++steps < 200) {
      const g = p.data.game;
      assert.equal(p.data.error, '');
      if (p.data.missionResultOpen) {
        assert.ok(!reveals.has(p.data.missionResult.missionNo)); reveals.add(p.data.missionResult.missionNo);
        p.confirmResult({ detail: { missionNo: p.data.missionResult.missionNo } }); continue;
      }
      if (g.phase !== 'ROLE_CONFIRM') {
        p.openRole(); assert.equal(p.data.roleOverlay, true); p.closeRole(); assert.equal(p.data.roleOverlay, false);
        p.openHistory(); assert.equal(p.data.viewVotes, true); p.toggleVotes(); assert.equal(p.data.viewVotes, false);
      }
      if (g.phase === 'ROLE_CONFIRM' && !p.data.role.confirmed) p.confirmRole({ detail: { gameId: g.gameId } });
      else if (g.phase === 'TEAM_BUILDING' && p.data.isLeader) {
        leaders.add('human');
        for (let id = 1; id <= g.requiredTeamSize; id++) p.selectSeat({ detail: { playerId: id } }); p.submitTeam();
      } else if (g.phase === 'TEAM_VOTING' && !g.hasVoted) p.approve();
      else if (g.phase === 'MISSION_EXECUTING' && g.onMission && !g.hasSubmittedMission) {
        p.openMission(); assert.equal(p.data.missionOverlayOpen, true);
        if (!g.evil) { p.missionFail(); assert.notEqual(p.data.missionChoice, 'FAIL'); }
        p.missionSuccess(); p.submitMission(); assert.equal(p.data.missionOverlayOpen, false);
      } else if (g.phase === 'ASSASSINATION' && g.assassin) {
        assassins.add('human');
        const target = p.data.room.players.find(v => !g.revealedEvilIdentities.some(e => e.playerId === v.playerId));
        p.selectSeat({ detail: { playerId: target.playerId } }); p.assassinate();
      } else {
        if (g.phase === 'TEAM_BUILDING') leaders.add('bot');
        if (g.phase === 'ASSASSINATION') assassins.add('bot');
        assert.ok(f.tick(), `bot stuck in ${g.phase}`);
      }
    }
    assert.ok(steps < 200); assert.equal(p.data.error, '');
    // A terminal mission still requires its final result animation acknowledgment.
    if (p.data.missionResultOpen) p.confirmResult({ detail: { missionNo: p.data.missionResult.missionNo } });
    assert.equal(p.data.finishedGroups.flatMap(group => group.players).length, 5);
    const oldId = p.data.game.gameId; p.restart();
    assert.notEqual(p.data.game.gameId, oldId); assert.equal(p.data.game.phase, 'ROLE_CONFIRM'); p.exit();
  }
  assert.equal(roles.size, 5); assert.equal(leaders.size, 2); assert.equal(assassins.size, 2);
});

test('private identity popup stays readable as bots advance from team selection to voting', () => {
  const f = fixture('demo-room', { random: () => 0.2 }), p = f.page; f.drain();
  p.confirmRole({ detail: { gameId: p.data.game.gameId } }); p.openRole();
  assert.equal(p.data.roleOverlay, true); assert.ok(f.tick());
  assert.equal(p.data.game.phase, 'TEAM_VOTING'); assert.equal(p.data.roleOverlay, true);
  p.closeRole(); assert.equal(p.data.roleOverlay, false); p.exit();
});
