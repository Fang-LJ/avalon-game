// Run with miniprogram-automator installed outside the shipped miniprogram package.
// IDE: cli auto --project <repo>/miniprogram --auto-port 9422
// NODE_PATH=<temporary-install>/node_modules node scripts/qa-v106-guest.js [output-dir]
const automator = require('miniprogram-automator');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(process.argv[2] || '/tmp/avalon-v106-native');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9422' });
  const token = await mini.callWxMethod('getStorageSync', 'AVALON_GAME_TOKEN');
  const checks = [];
  mini.on('exception', e => console.error('MINI_EXCEPTION', e));
  const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
  async function launch(route) {
    await mini.reLaunch(route);
    // Resolve after compilation/navigation, not a page object invalidated by hot reload.
    for (let i = 0; i < 30; i++) {
      const p = await mini.currentPage();
      if (p && p.path === route.slice(1)) {
        const data = await p.data();
        if (data.room || data.roles || data.config || data.stages || data.guestFeatures) return p;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('Page did not load: ' + route);
  }
  async function snap(name) { await mini.screenshot({ path: path.join(output, name + '.png') }); }
  async function clickSeat(page, id) {
    for (const seat of await page.$$('player-seat')) if ((await seat.data('player')).playerId === id) {
      await (await seat.$('.seat-avatar')).tap(); return;
    }
    throw Error('Seat missing: ' + id);
  }
  try {
    await mini.callWxMethod('removeStorageSync', 'AVALON_GAME_TOKEN');
    await mini.evaluate(() => { globalThis.__guestCalls = []; });
    for (const method of ['login', 'request', 'connectSocket', 'getUserProfile'])
      await mini.mockWxMethod(method, function () { globalThis.__guestCalls.push(arguments[0]); throw Error('Unexpected guest identity/network call'); });
    console.log('QA_MOCKS_READY');
    let page = await launch('/pages/login/login'); console.log('QA_LOGIN_READY'); await page.waitFor(300);
    const modules = await page.$$('.guest-feature'); check(modules.length === 4, 'four login cards');
    console.log('QA_CARDS_READY');
    const positions = await Promise.all(modules.map(e => e.offset()));
    check(positions[0].top === positions[1].top && positions[2].top === positions[3].top && positions[2].top > positions[0].top, '2 by 2 order');
    console.log('QA_CARD_POSITIONS_READY');
    const brand = await (await page.$('.brand-mark')).offset();
    console.log('QA_BRAND_POSITION_READY');
    const menu = await mini.evaluate(() => wx.getMenuButtonBoundingClientRect());
    check(brand.top > menu.bottom, 'brand clears WeChat capsule');
    await snap('login');
    for (const [key, route] of [['rules','guide'],['roles','roles'],['configuration','configuration']]) {
      await (await page.$(`[data-key="${key}"]`)).tap(); await page.waitFor(300); page = await mini.currentPage();
      check(page.path === `pages/${route}/${route}`, 'open ' + key + ' without auth');
      if (key === 'roles') {
        await (await page.$('.role-row')).tap(); await page.waitFor(100);
        check(!!(await page.data('selectedRole')), 'role card opens'); await snap('role-card'); await page.callMethod('closeRole');
      }
      if (key === 'configuration') {
        await (await page.$('[data-count="10"]')).tap();
        check((await page.data('config')).lady === true, '10-person Lady rule');
        check((await page.data('config')).tasks[3].fails === 2, 'fourth mission threshold');
      }
      await snap(route); await page.callMethod('back'); await page.waitFor(200); page = await mini.currentPage();
      check(page.path === 'pages/login/login', 'return from ' + key);
    }
    await (await page.$('[data-key="demo"]')).tap(); await page.waitFor(300); page = await mini.currentPage();
    check(page.path === 'pages/demo-room/demo-room', 'enter demo from login card');
    check((await page.data('room')).currentPlayers === 1, 'single visitor lobby');
    await snap('demo-lobby'); await page.callMethod('addBot'); await page.callMethod('fillBots');
    check((await page.data('room')).currentPlayers === 5, 'single and bulk bots');
    await page.callMethod('start');
    const firstGame = (await page.data('game')).gameId;
    let iteration = 0, previous = '', results = new Set();
    while (++iteration < 180) {
      const data = await page.data(), g = data.game;
      if (g.phase !== previous) { console.log('PHASE', g.phase, 'mission', g.missionNo); previous = g.phase; }
      check(data.room.players.every(p => !p.roleCode && !p.alignment), 'public players omit identities');
      if (data.missionResultOpen) {
        const component = await page.$('mission-result-overlay');
        if (component && await component.data('stage') === 'RESULT') {
          const n = data.missionResult.missionNo; check(!results.has(n), 'mission reveal once ' + n); results.add(n);
          await snap('mission-result-' + n); await (await component.$('.result-confirm')).tap();
        }
      } else if (g.phase === 'FINISHED') {
        check(data.finishedGroups.flatMap(group => group.players).length === 5, 'all five identities at settlement');
        check(['GOOD','EVIL'].includes(g.winner), 'full game produces winner'); await snap('demo-finished'); break;
      } else if (g.phase === 'ROLE_CONFIRM') {
        const stage = await page.$('card-deal-stage'); const state = await stage.data('dealStage');
        if (state === 'BACK') await (await (await stage.$('play-card')).$('.card-scene')).tap();
        if (state === 'REVEALED' && !data.role.confirmed) { await snap('demo-identity'); await (await stage.$('.confirm-button')).tap(); }
      } else if (g.phase === 'TEAM_BUILDING' && data.isLeader) {
        for (let id = 1; id <= g.requiredTeamSize; id++) if (!(await page.data('selectedIds')).includes(id)) await clickSeat(page, id);
        await snap('demo-team'); await page.callMethod('submitTeam');
      } else if (g.phase === 'TEAM_VOTING' && !g.hasVoted) await page.callMethod('approve');
      else if (g.phase === 'MISSION_EXECUTING' && g.onMission && !g.hasSubmittedMission) {
        await page.callMethod('openMission'); const overlay = await page.$('mission-card-overlay');
        check(!!overlay, 'human mission selector opens');
        if (!g.evil) check(await overlay.$('.mission-card-option:nth-child(2)') === null, 'good cannot choose failure card');
        await snap('demo-mission-choice'); await page.callMethod('missionSuccess'); await page.callMethod('submitMission');
      } else if (g.phase === 'ASSASSINATION' && g.assassin) {
        const target = data.room.players.find(p => !g.revealedEvilIdentities.some(e => e.playerId === p.playerId));
        await clickSeat(page, target.playerId); await snap('demo-assassination'); await page.callMethod('assassinate');
      }
      await page.waitFor(450);
    }
    check(iteration < 180, 'full game completes without bot stall');
    await page.callMethod('restart'); check((await page.data('game')).gameId !== firstGame, 'rematch uses new random deal');
    check((await page.data('game')).phase === 'ROLE_CONFIRM', 'rematch resets animation phase');
    await mini.mockWxMethod('showModal', { confirm: true, cancel: false });
    await page.callMethod('exit'); await page.waitFor(900);
    check((await mini.currentPage()).path === 'pages/login/login', 'confirmed exit returns login');
    const calls = await mini.evaluate(() => globalThis.__guestCalls);
    check(calls.length === 0, 'zero login, user profile, backend requests, or WebSocket calls');
    fs.writeFileSync(path.join(output,'report.json'), JSON.stringify({ system: await mini.systemInfo(), checks: checks.length, results: [...results], networkCalls: calls.length }, null, 2));
    console.log('NATIVE_GUEST_PASS', checks.length, 'checks', output);
  } finally {
    try { const p = await mini.currentPage(); if (p.path === 'pages/demo-room/demo-room') await p.callMethod('onUnload'); } catch (_) {}
    for (const method of ['login','request','connectSocket','getUserProfile','showModal']) await mini.restoreWxMethod(method);
    if (token) await mini.callWxMethod('setStorageSync','AVALON_GAME_TOKEN',token);
    else await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');
    await mini.evaluate(() => { delete globalThis.__guestCalls; }); mini.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
