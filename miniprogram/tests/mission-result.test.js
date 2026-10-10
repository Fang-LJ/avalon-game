const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CARDS, CARD_BASE } = require('../utils/cards');
const { normalizeResult, resultCards, storageKey } = require('../utils/mission-result');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const result = (missionNo = 1, successCount = 2, failCount = 0, status = 'SUCCESS') =>
  ({ missionNo, successCount, failCount, status });

function component(value = result()) {
  let definition, now = 0, serial = 0;
  const timers = new Map();
  vm.runInNewContext(read('components/mission-result-overlay/mission-result-overlay.js'), {
    require: name => require(path.resolve(root, 'components/mission-result-overlay', name)),
    Component: value => { definition = value; },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const c = { data: { ...structuredClone(definition.data), ...value, visible: true }, events: [],
    ...definition.methods, setData: values => Object.assign(c.data, values),
    triggerEvent: (name, detail) => c.events.push({ name, detail }) };
  definition.lifetimes.attached.call(c);
  return { c, definition, timers, tick(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  } };
}

function roomFixture({ phase = 'TEAM_BUILDING', latest = result(), storage = new Map(), member = false, n = 5 } = {}) {
  let page;
  let snapshot = { gameId: 71, missionNo: 2, proposalNo: 1, phase,
    latestMissionResult: latest, onMission: member, hasSubmittedMission: false,
    selectedPlayerIds: member ? [1,2] : [], requiredTeamSize: 2, leaderPlayerId: 1 };
  const players = Array.from({ length: n }, (_,i) => ({ playerId: i+1, seatNo: i+1,
    nickname: i ? `机器人${i}` : '玩家', isBot: i > 0, me: i === 0 }));
  const calls = [];
  const api = {
    room: async () => ({ roomId: 71, currentGameId: snapshot.gameId, maxPlayers: n,
      players, myPlayerId: 1, host: true, testGame: true }),
    game: async () => ({ ...snapshot }), timeline: async () => ({ missions: [], proposals: [] }),
    myRole: async () => ({ roleCode: 'MERLIN', visiblePlayers: [], confirmed: true }),
  };
  let connects = 0;
  vm.runInNewContext(read('pages/room/room.js'), {
    require: name => name === '../../services/avalon' ? api
      : name === '../../services/auth' ? { requireSession: () => true }
        : name === '../../utils/socket' ? { connect: () => { connects++; return () => {}; } }
          : require(path.resolve(root,'pages/room',name)),
    Page: value => { page = value; },
    wx: { getStorageSync: key => storage.get(key), setStorageSync: (key,value) => storage.set(key,value) },
    setInterval: () => 1, clearInterval() {},
  });
  page.data = structuredClone(page.data); page.data.roomId = 71; page.active = true;
  page.setData = values => { calls.push(values); Object.assign(page.data, values); };
  return { page, storage, calls, connects: () => connects,
    set: values => { snapshot = { ...snapshot, ...values }; },
    confirm: () => page.confirmMissionResult({ detail: { missionNo: page.data.missionResult.missionNo } }) };
}

for (const [success, fail, expected] of [
  [2,0,['SUCCESS','SUCCESS']], [2,1,['SUCCESS','SUCCESS','FAIL']],
  [3,2,['SUCCESS','SUCCESS','SUCCESS','FAIL','FAIL']], [0,2,['FAIL','FAIL']],
]) test(`anonymous cards ${success}/${fail} are success-first regardless of submissions`, () => {
  const input = { ...result(1,success,fail), missionActions: [{ playerId: 99, choice: 'FAIL' }] };
  assert.deepEqual(resultCards(input).map(card => card.type), expected);
  assert.deepEqual(Object.keys(normalizeResult(input)), ['missionNo','successCount','failCount','status']);
  for (const card of resultCards(input)) assert.deepEqual(Object.keys(card), ['index','type','flipped']);
});

test('invalid incomplete or oversized totals do not manufacture result cards', () => {
  for (const value of [null, {}, result(0), result(6), result(1,-1,3), result(1,2.5,0),
    result(1,null,2), result(1,1,0), result(1,4,2), result(1,2,0,'EXECUTING')]) {
    assert.equal(normalizeResult(value), null); assert.deepEqual(resultCards(value), []);
  }
});

test('result component has no participant props, API requests or business randomization', () => {
  const { definition } = component();
  assert.deepEqual(Object.keys(definition.properties).sort(),
    ['missionNo','successCount','failCount','status','successCard','failCard','cardBack','visible'].sort());
  const source = read('components/mission-result-overlay/mission-result-overlay.js');
  assert.doesNotMatch(source, /playerId|gamePlayerId|missionActions|choiceByPlayer|services|wx\.|Math.random/);
  const markup = read('components/mission-result-overlay/mission-result-overlay.wxml');
  assert.match(markup, /<play-card size="result"/);
  assert.doesNotMatch(markup, /<image|playerId|missionActions/);
  assert.match(markup, /stage === 'REVEAL' \|\| stage === 'RESULT'/);
});

for (const count of [2,3,4,5]) test(`${count} cards collect shuffle spread sequentially reveal and finish within 4 seconds`, () => {
  const { c, tick } = component(result(1,count-1,1,'FAILED'));
  assert.equal(c.data.stage,'COLLECT'); assert.ok(c.data.cards.every(card => !card.flipped));
  c.confirm(); assert.equal(c.events.length,0);
  tick(400); assert.equal(c.data.stage,'SHUFFLE');
  tick(900); assert.equal(c.data.stage,'SPREAD'); assert.ok(c.data.cards.every(card => !card.flipped));
  tick(400); assert.equal(c.data.stage,'REVEAL');
  for (let index=0; index<count; index++) {
    assert.equal(c.data.cards.filter(card => card.flipped).length,index+1);
    c.confirm(); assert.equal(c.events.length,0);
    if (index+1<count) tick(280);
  }
  tick(1019); assert.equal(c.data.stage,'REVEAL');
  tick(1); assert.equal(c.data.stage,'RESULT');
  c.confirm(); c.confirm(); assert.equal(c.events.length,1);
  assert.equal(c.events[0].detail.missionNo,1);
  assert.ok(1700+(count-1)*280+1020<=4000);
});

test('same result observer refresh never restarts or delays the animation', () => {
  const { c, tick, definition } = component();
  tick(300); definition.observers['visible,missionNo,successCount,failCount,status'].call(c);
  tick(100); assert.equal(c.data.stage,'SHUFFLE');
  tick(2600); assert.equal(c.data.stage,'RESULT'); c.syncResult(); assert.equal(c.data.stage,'RESULT');
});

test('new result cancels every stale timer and starts with only backs', () => {
  const { c, tick, timers } = component();
  tick(1800); Object.assign(c.data,result(2,3,1)); c.syncResult();
  assert.equal(timers.size,1); assert.equal(c.data.stage,'COLLECT');
  assert.ok(c.data.cards.every(card => !card.flipped));
  tick(400); assert.equal(c.data.stage,'SHUFFLE');
});

test('hide in every animation stage recovers all fronts to RESULT without auto acknowledgment', () => {
  for (const elapsed of [100,600,1400,1800,2600]) {
    const { c, tick, timers, definition } = component(result(1,3,2));
    tick(elapsed); definition.pageLifetimes.hide.call(c);
    assert.equal(timers.size,0); assert.equal(c.data.stage,'RESULT');
    assert.ok(c.data.cards.every(card => card.flipped)); c.confirm(); assert.equal(c.events.length,0);
    definition.pageLifetimes.show.call(c); c.confirm(); assert.equal(c.events.length,1);
  }
});

test('detached or invisible components cannot mutate later or emit confirmation', () => {
  const { c, tick, timers, definition } = component();
  definition.lifetimes.detached.call(c); tick(5000);
  assert.equal(timers.size,0); assert.equal(c.data.stage,'COLLECT'); c.confirm(); assert.equal(c.events.length,0);
  const other = component(); other.c.data.visible=false; other.c.syncResult(); other.tick(5000);
  assert.equal(other.timers.size,0); assert.equal(other.c.data.stage,'COLLECT');
});

for (const phase of ['TEAM_BUILDING','LADY_OF_LAKE','ASSASSINATION','FINISHED']) {
  test(`new result atomically covers already-advanced ${phase} for a non-mission player`, async () => {
    const { page, calls, confirm } = roomFixture({ phase });
    await page.fetchState(); assert.equal(page.data.missionResultOpen,true);
    assert.equal(page.data.game.phase,phase); assert.equal(page.data.missionResultKey,'71-1');
    const update = calls.find(value => value.game && value.game.phase === phase);
    assert.equal(update.missionResultOpen,true);
    confirm(); assert.equal(page.data.missionResultOpen,false); assert.equal(page.data.game.phase,phase);
  });
}

test('mission participants and bystanders both see the same anonymous result', async () => {
  for (const member of [false,true]) {
    const { page } = roomFixture({ member }); await page.fetchState();
    assert.equal(page.data.missionResultOpen,true);
    assert.deepEqual(JSON.parse(JSON.stringify(page.data.missionResult)),result());
  }
});

test('polling preserves open reveal; confirmation persists once and polling cannot reopen it', async () => {
  const { page, confirm, storage } = roomFixture();
  await page.fetchState(); const initial=page.data.missionResult;
  await page.fetchState(); await page.fetchState(); assert.equal(page.data.missionResult,initial);
  confirm(); assert.equal(storage.get(storageKey(71)),1);
  await page.fetchState(); await page.fetchState(); assert.equal(page.data.missionResultOpen,false);
  assert.equal(page.data.acknowledgedMissionResultKey,'71-1');
});

test('new mission reopens and new game storage is isolated', async () => {
  const { page, confirm, set, storage } = roomFixture();
  await page.fetchState(); confirm(); set({ latestMissionResult:result(2) });
  await page.fetchState(); assert.equal(page.data.missionResultKey,'71-2'); confirm();
  set({ gameId:72, latestMissionResult:result(1) }); await page.fetchState();
  assert.equal(page.data.missionResultOpen,true); assert.equal(page.data.missionResultKey,'72-1');
  assert.equal(storage.get(storageKey(71)),2); assert.equal(storage.has(storageKey(72)),false);
});

test('unconfirmed result survives page recreation while acknowledged result does not reappear', async () => {
  const storage=new Map();
  const first=roomFixture({ storage }); await first.page.fetchState();
  first.page.onHide();
  const second=roomFixture({ storage }); await second.page.fetchState(); assert.equal(second.page.data.missionResultOpen,true);
  second.confirm(); second.page.onHide();
  const third=roomFixture({ storage }); await third.page.fetchState(); assert.equal(third.page.data.missionResultOpen,false);
});

test('onShow reconnects and refreshes a missed result and does not reopen confirmed results', async () => {
  const fixture=roomFixture({ latest:null }); await fixture.page.fetchState(); fixture.page.onHide();
  fixture.set({ latestMissionResult:result(3) }); fixture.page.onShow(); await fixture.page.refreshing;
  assert.equal(fixture.page.data.missionResultOpen,true); assert.ok(fixture.connects()>0);
  fixture.confirm(); fixture.page.onHide(); fixture.page.onShow(); await fixture.page.refreshing;
  assert.equal(fixture.page.data.missionResultOpen,false);
});

test('MISSION_COMPLETED refreshes server totals, ignoring any event result payload', async () => {
  const { page, set }=roomFixture({ latest:null }); await page.fetchState();
  set({ latestMissionResult:result(2,1,2,'FAILED') });
  page.handleRoomEvent({ type:'MISSION_COMPLETED', roomId:71, successCount:99, failCount:0 });
  await page.refreshing; assert.equal(page.data.missionResult.failCount,2);
  assert.equal(page.data.missionResult.status,'FAILED');
});

test('last member submission phase change closes private choice and opens public result', async () => {
  const { page, set }=roomFixture({ phase:'MISSION_EXECUTING',latest:null,member:true });
  await page.fetchState(); page.missionSuccess(); assert.equal(page.data.missionOverlayOpen,true);
  page.setData({ roleOverlay:true,viewVotes:true });
  set({ phase:'FINISHED',latestMissionResult:result(3,1,2,'FAILED'),hasSubmittedMission:true });
  await page.fetchState(); assert.equal(page.data.missionResultOpen,true);
  assert.equal(page.data.missionOverlayOpen,false); assert.equal(page.data.missionChoice,'');
  assert.equal(page.data.roleOverlay,false); assert.equal(page.data.viewVotes,false);
  page.openRoleOverlay(); page.openMissionOverlay(); page.toggleVotes();
  assert.equal(page.data.roleOverlay,false); assert.equal(page.data.missionOverlayOpen,false); assert.equal(page.data.viewVotes,false);
});

test('a newer result does not interrupt an in-progress reveal but follows confirmation', async () => {
  const { page,set,confirm }=roomFixture(); await page.fetchState();
  set({ latestMissionResult:result(2) }); await page.fetchState();
  assert.equal(page.data.missionResult.missionNo,1); confirm();
  assert.equal(page.data.missionResultOpen,true); assert.equal(page.data.missionResult.missionNo,2);
  confirm(); assert.equal(page.data.missionResultOpen,false);
});

test('stored newer acknowledgment rejects stale totals and corrupted storage cannot hide valid results', async () => {
  for (const value of [null,'4',99,{},-1]) {
    const { page }=roomFixture({ storage:new Map([[storageKey(71),value]]) });
    await page.fetchState(); assert.equal(page.data.missionResultOpen,true);
  }
  const { page }=roomFixture({ storage:new Map([[storageKey(71),3]]) });
  await page.fetchState(); assert.equal(page.data.missionResultOpen,false);
});

test('storage read or write failures never freeze the client and retain session acknowledgment', async () => {
  const { page,confirm }=roomFixture({ storage: { get() { throw new Error('storage read'); },
    set() { throw new Error('storage full'); } } });
  await page.fetchState(); assert.equal(page.data.missionResultOpen,true);
  confirm(); await page.fetchState(); assert.equal(page.data.missionResultOpen,false);
});

test('stale confirmation cannot acknowledge another mission or a rematch', async () => {
  const { page,set,storage }=roomFixture(); await page.fetchState();
  page.confirmMissionResult({ detail:{ missionNo:2 } });
  assert.equal(page.data.missionResultOpen,true); assert.equal(storage.size,0);
  set({ gameId:72,latestMissionResult:null,phase:'ROLE_CONFIRM' }); await page.fetchState();
  page.confirmMissionResult({ detail:{ missionNo:1 } });
  assert.equal(page.data.missionResultOpen,false); assert.equal(storage.size,0);
});

test('fourth mission with one FAIL and server SUCCESS still displays success', async () => {
  const { page }=roomFixture({ latest:result(4,4,1,'SUCCESS'),n:7 });
  await page.fetchState(); assert.equal(page.data.missionResult.status,'SUCCESS');
  assert.equal(resultCards(page.data.missionResult).at(-1).type,'FAIL');
  const markup=read('components/mission-result-overlay/mission-result-overlay.wxml');
  assert.match(markup,/status === 'SUCCESS' \? '成功' : '失败'/);
  assert.doesNotMatch(markup,/failCount\s*[><=!]/);
});

test('resources are reused and result overlay is above every existing overlay', () => {
  for (const file of [CARDS.actions.SUCCESS,CARDS.actions.FAIL,CARDS.back.ACTION]) {
    assert.ok(file.startsWith(CARD_BASE + '/'));
    assert.ok(fs.existsSync(path.join(root,'../static-assets/avalon/cards/v1',file.slice(CARD_BASE.length + 1))));
  }
  const markup=read('pages/room/room.wxml');
  const resultMarkup=markup.split('<mission-result-overlay')[1].split('/>')[0];
  assert.match(resultMarkup,/missionNo="\{\{missionResult.missionNo\}\}"/);
  assert.doesNotMatch(resultMarkup,/onMission|phase|playerId|missionActions/);
  assert.match(resultMarkup,/bind:confirm="confirmMissionResult"/);
  assert.match(read('components/mission-result-overlay/mission-result-overlay.wxss'),/z-index: 100/);
});

test('2–5 result cards fit at 375 390 430px with original front ratio and safe confirmation footer', () => {
  const css=read('components/play-card/play-card.wxss');
  const overlayCss=read('components/mission-result-overlay/mission-result-overlay.wxss');
  for (const [count,width,height,gap] of [[2,200,278,20],[3,170,236.3,16],[4,140,194.6,12],[5,118,164.02,12]]) {
    assert.match(css,new RegExp(`width: ${width}rpx; height: ${height}rpx`));
    assert.ok(Math.abs(width/height-600/834)<0.0001);
    for (const viewport of [375,390,430])
      assert.ok((count*width+(count-1)*gap)*viewport/750 < viewport-64*viewport/750);
  }
  assert.match(overlayCss,/safe-area-inset-top/); assert.match(overlayCss,/safe-area-inset-bottom/);
  assert.match(overlayCss,/\.result-footer \{ flex-shrink: 0/);
  assert.match(read('components/play-card/play-card.wxml'),/mode="aspectFit"/);
});

test('5 7 10 player client bot fixtures retain underlying result phases after confirmation', async () => {
  for (const [n,phase,latest] of [[5,'TEAM_BUILDING',result(1)], [5,'FINISHED',result(3,1,2,'FAILED')],
    [7,'TEAM_BUILDING',result(4,3,1)], [7,'ASSASSINATION',result(3,4,0)],
    [10,'LADY_OF_LAKE',result(2,3,1,'SUCCESS')]]) {
    const { page,confirm }=roomFixture({ n,phase,latest }); await page.fetchState();
    assert.equal(page.data.missionResultOpen,true); confirm();
    assert.equal(page.data.missionResultOpen,false); assert.equal(page.data.game.phase,phase);
  }
});
