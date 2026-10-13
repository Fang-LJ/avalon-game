const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { ROUTES, ROLES } = require('../utils/guest-content');
function fixture(name = 'demo-room') {
  let page, modal; const timers = new Map(), callbacks = [], calls = []; let serial = 0;
  const fail = operation => () => { throw Error(`Guest attempted ${operation}`); };
  const wx = { login: fail('login'), request: fail('network request'), connectSocket: fail('WebSocket'),
    setStorageSync: fail('storage write'), getStorageSync: fail('token read'), removeStorageSync: fail('storage delete'),
    getUserProfile: fail('WeChat identity'), getWindowInfo: () => ({ statusBarHeight: 47 }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 79 }), showModal: value => { modal = value; },
    navigateBack: () => calls.push('back'), reLaunch: o => calls.push(o.url), navigateTo: o => calls.push(o.url) };
  const cache = new Map();
  function load(file) {
    if(cache.has(file))return cache.get(file).exports;
    const module = {exports:{}};cache.set(file,module);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,wx,getCurrentPages:()=>[{}],require:request=>{
      assert.doesNotMatch(request,/services|socket|token|request|auth/);
      return load(path.resolve(path.dirname(file),request+'.js'));
    }});
    return module.exports;
  }
  const source = fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8');
  vm.runInNewContext(source, { Page: p => { page = p; }, wx, getCurrentPages: () => [{}],
    require: request => {
      assert.doesNotMatch(request, /services|socket|token|request|auth/);
      return load(path.resolve(root, `pages/${name}`, request + '.js'));
    },
    setTimeout: callback => { const id = ++serial; timers.set(id, callback); callbacks.push(callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  page.data = structuredClone(page.data); page.setData = value => Object.assign(page.data, JSON.parse(JSON.stringify(value)));
  page.onLoad?.(); page.onShow?.();
  const tick = () => { const [id, fn] = timers.entries().next().value || []; if (fn) { timers.delete(id); fn(); return true; } return false; };
  const drain = () => { for (let i = 0; i < 20 && tick(); i++); assert.ok(timers.size <= 1); };
  return { page, wx, timers, callbacks, calls, tick, drain, modal: () => modal };
}
function playing() {
  const f = fixture(); f.page.fillBots(); f.page.start(); f.drain();
  f.page.confirmRole({ detail: { gameId: f.page.data.game.gameId } }); return f;
}
for (const name of ['guide','roles','configuration','demo-room']) test(`${name} loads without a token or auth/network/storage/identity access`, () => {
  const f = fixture(name);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(manifest.pages.includes(`pages/${name}/${name}`));
  if (name !== 'demo-room') { f.page.back(); assert.deepEqual(f.calls, ['/pages/login/login']); }
  else { assert.equal(f.page.data.room.currentPlayers, 1); f.page.onUnload(); }
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
  const f = fixture(); f.page.fillBots(); f.page.start(); assert.equal(f.timers.size,1);
  f.page.syncView(); f.page.syncView(); assert.equal(f.timers.size,1);
  const callbacks=f.callbacks.slice(), engine=f.page.engine; f.page.onHide(); const before=engine.getView();
  assert.equal(f.timers.size,0); for(const callback of callbacks)callback(); assert.deepEqual(engine.getView(),before);
  f.page.onShow();assert.equal(f.timers.size,1); f.page.onUnload();assert.equal(f.timers.size,0);assert.equal(engine.isDisposed(),true);
  for(const callback of f.callbacks)callback();assert.deepEqual(engine.getView(),before);
});
test('exit confirmation pauses bots, cancellation resumes, and confirmed exit clears in-memory game', () => {
  const f=fixture();f.page.fillBots();f.page.start();f.page.exit();assert.equal(f.timers.size,0);
  f.modal().success({confirm:false});assert.equal(f.timers.size,1);
  f.page.exit();const engine=f.page.engine;f.modal().success({confirm:true});
  assert.equal(f.page.engine,null);assert.equal(engine.isDisposed(),true);assert.equal(f.timers.size,0);assert.deepEqual(f.calls,['/pages/login/login']);
});
test('backgrounding an open confirmation never leaves resumed page permanently blocked',()=>{
  const f=fixture();f.page.fillBots();f.page.start();f.page.exit();f.page.onHide();f.modal().success({confirm:false});
  f.page.onShow();assert.equal(f.page.confirmingExit,false);assert.equal(f.timers.size,1);f.page.onUnload();
});
test('restart replaces the engine, redeals identities and refuses every previous timer callback',()=>{
  const f=playing(), old=f.page.engine, oldId=f.page.data.game.gameId, stale=f.callbacks.slice();
  f.page.restart();f.modal().success({confirm:true});assert.notEqual(f.page.engine,old);assert.ok(old.isDisposed());
  assert.notEqual(f.page.data.game.gameId,oldId);assert.equal(f.page.data.game.phase,'ROLE_CONFIRM');assert.equal(f.page.resultAck,0);
  const before=f.page.engine.getView();for(const callback of stale)callback();assert.deepEqual(f.page.engine.getView(),before);f.page.onUnload();
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
  const f=playing();f.page.end();f.modal().success({confirm:true});
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
