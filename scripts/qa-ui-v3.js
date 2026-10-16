// Focused native UI review against Figma V3. All HTTP/upload/identity calls are isolated.
// NODE_PATH=<temporary miniprogram-automator install>/node_modules node scripts/qa-ui-v3.js [output]
const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.argv[2] || '/tmp/avalon-ui-v3';
fs.mkdirSync(output, { recursive: true });
const fixtures = () => ({
  profile: { userId: 900001, nickname: 'Fang', avatarUrl: '', profileComplete: true },
  stats: { totalGames: 2, wins: 1, losses: 1, winRate: 50, roleCounts: [], goodGames: 2, goodWins: 1, evilGames: 0, evilWins: 0 },
  history: [
    { gameId: 990001, roomCode: '437347', alignment: 'GOOD', roleName: '梅林', playerCount: 6, winner: null, won: false, finishedAt: '2026-10-11T22:32:00' },
    { gameId: 990002, alignment: 'GOOD', roleName: '梅林', playerCount: 6, winner: 'GOOD', won: true, finishedAt: '2026-10-11T14:05:00' },
    { gameId: 990003, alignment: 'GOOD', roleName: '忠臣', playerCount: 6, winner: 'EVIL', won: false, finishedAt: '2026-10-11T13:38:00' },
  ], currentRoom: null, calls: [],
});
(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9422' });
  await new Promise(r => setTimeout(r, 3000));
  const saved = await mini.evaluate(() => ({ token: wx.getStorageSync('AVALON_GAME_TOKEN'), consent: wx.getStorageSync('AVALON_LEGAL_CONSENT') }));
  const errors = [], reports = [];
  mini.on('exception', e => errors.push(e));
  const mocked = ['login', 'request', 'uploadFile', 'requirePrivacyAuthorize', 'chooseMedia'];
  const system = await mini.systemInfo();
  try {
    for (const key of ['AVALON_GAME_TOKEN', 'AVALON_LEGAL_CONSENT']) await mini.callWxMethod('removeStorageSync', key);
    await mini.evaluate(f => { getApp().__v3Fixture = f; }, fixtures());
    await mini.mockWxMethod('login', function () { throw Error('No real login in UI review'); });
    await mini.mockWxMethod('request', function (o) {
      const f = getApp().__v3Fixture;
      f.calls.push({ url: o.url, method: o.method || 'GET', data: o.data });
      if (o.method && o.method !== 'GET') throw Error('UI review blocks backend writes');
      if (f.error) return { statusCode: 503, data: { code: 'UNAVAILABLE', message: 'Isolated network failure' } };
      let data = {};
      if (/\/me\/profile$/.test(o.url)) data = f.profile;
      else if (/\/me\/stats$/.test(o.url)) data = f.stats;
      else if (/\/me\/games\?/.test(o.url)) { const good = /alignment=GOOD/.test(o.url), evil = /alignment=EVIL/.test(o.url); const items = f.history.filter(h => !good && !evil || good && h.alignment === 'GOOD' || evil && h.alignment === 'EVIL'); data = { items: /size=1(?:&|$)/.test(o.url) ? items.slice(0, 1) : items, total: items.length }; }
      else if (/\/room\/current$/.test(o.url)) data = f.currentRoom;
      return { statusCode: 200, data: { code: 'SUCCESS', data } };
    });
    await mini.mockWxMethod('uploadFile', function (o) { getApp().__v3Fixture.calls.push({ upload: o.url }); return { statusCode: 200, data: JSON.stringify({ code: 'SUCCESS', data: { url: '/assets/guest/default-avatar.svg' } }) }; });
    await mini.mockWxMethod('requirePrivacyAuthorize', function () { getApp().__v3Fixture.calls.push({ privacy: true }); return {}; });
    await mini.mockWxMethod('chooseMedia', function () { getApp().__v3Fixture.calls.push({ album: true }); return { tempFiles: [{ tempFilePath: '/assets/guest/default-avatar.svg' }] }; });
    async function capture(p, name) {
      await p.waitFor(180);
      const root = await p.$('.ui-v3-page');
      assert.ok(root, name + ' page exists');
      const images = await p.$$('image'), assets = [];
      for (const tag of ['page-head', 'app-tab-bar']) { const child = await p.$(tag); if (child) images.push(...await child.$$('image')); }
      for (const img of images) { const src = await img.attribute('src'); assets.push({ src, size: await img.size(), offset: await img.offset() }); }
      await mini.screenshot({ path: path.join(output, name + '.png') });
      reports.push({ name, route: p.path, system, data: await p.data(), markup: await root.outerWxml(), assets });
      fs.writeFileSync(path.join(output, 'native-report.json'), JSON.stringify({ reports, errors }, null, 2));
      console.log('V3_NATIVE', name);
    }
    let p = await mini.reLaunch('/pages/login/login');
    await p.setData({ mockLogin: false });
    assert.equal(await p.data('agreed'), false);
    assert.equal(await (await p.$('.login-button')).property('disabled'), true);
    await capture(p, 'login-unchecked');
    await mini.callWxMethod('setStorageSync', 'AVALON_GAME_TOKEN', 'isolated-v3-session');
    await p.callMethod('toggleAgreement');
    assert.equal(await (await p.$('.login-button')).property('disabled'), false);
    await capture(p, 'login');
    p = await mini.reLaunch('/pages/index/index'); await p.waitFor(250); await p.setData({ mockLogin: false }); await capture(p, 'home');
    await p.setData({ profile: { ...fixtures().profile, nickname: '中English混合长昵称'.repeat(5), initial: '中' } }); await capture(p, 'home-long-name');
    await p.setData({ profile: { ...fixtures().profile, initial: 'F' } });
    await p.setData({ currentRoom: { roomId: 990001, roomCode: '123456' } }); assert.ok(await p.$('.return-room')); await capture(p, 'home-current-room');
    await p.setData({ currentRoom: null, recent: null, loading: false }); await capture(p, 'home-empty');
    await p.setData({ loading: true }); await capture(p, 'home-loading');
    await p.setData({ loading: false, error: '加载失败，点击重试' }); await capture(p, 'home-error');
    p = await mini.reLaunch('/pages/history/history'); await p.waitFor(250); await capture(p, 'history');
    await p.callMethod('filter', { currentTarget: { dataset: { key: 'GOOD' } } }); await p.waitFor(200); assert.equal(await p.data('alignment'), 'GOOD'); await capture(p, 'history-good');
    await p.callMethod('filter', { currentTarget: { dataset: { key: 'EVIL' } } }); await p.waitFor(200); await capture(p, 'history-evil');
    await p.setData({ stats: { totalGames: 0, wins: 0, losses: 0, winRate: 0 }, items: [], total: 0, recordWinPercent: 0, recordLossPercent: 0, alignment: '' }); await capture(p, 'history-empty');
    p = await mini.reLaunch('/pages/profile/profile'); await p.waitFor(250); await capture(p, 'profile');
    await p.callMethod('openAvatarSheet'); assert.equal(await p.data('avatarSheetOpen'), true); await capture(p, 'avatar-sheet');
    await p.callMethod('closeAvatarSheet'); await p.callMethod('focusNickname'); await p.waitFor(80); assert.equal(await p.data('nicknameFocused'), true);
    await p.callMethod('nicknameBlur', { detail: { value: '手动昵称' } }); assert.equal(await p.data('nickname'), '手动昵称');
    await p.callMethod('chooseFromAlbum'); await p.waitFor(250); assert.equal(await p.data('uploading'), false); assert.equal(await p.data('avatarUrl'), '/assets/guest/default-avatar.svg');
    const calls = await mini.evaluate(() => getApp().__v3Fixture.calls); const privacy = calls.findIndex(c => c.privacy), album = calls.findIndex(c => c.album), upload = calls.findIndex(c => c.upload); assert.ok(privacy >= 0 && album > privacy && upload > album, 'album uses original privacy and upload chain');
    p = await mini.reLaunch('/pages/profile/profile?mode=edit'); await p.waitFor(200); assert.equal(await p.$('.profile-skip'), null); await capture(p, 'profile-edit');
    p = await mini.reLaunch('/pages/me/me'); await p.waitFor(250); await p.setData({ mockLogin: false }); await capture(p, 'me');
    await mini.pageScrollTo(10000); await p.waitFor(100);
    const nav = await mini.evaluate(() => new Promise(resolve => wx.createSelectorQuery().select('.v3-nav-wrap').boundingClientRect(resolve).exec()));
    assert.ok(Math.abs(nav.top) < 1, 'V3 header remains above scrolling content');
    const logout = await p.$('.logout-button'), bar = await (await p.$('app-tab-bar')).$('.tab-bar');
    assert.ok((await logout.offset()).top + Number((await logout.size()).height) <= (await bar.offset()).top, 'logout reachable above fixed tab bar');
    await capture(p, 'me-bottom'); await mini.pageScrollTo(0);
    await p.setData({ profile: { nickname: '中文English非常长的混合昵称'.repeat(4), initial: '中', avatarUrl: '' } }); await capture(p, 'me-long-name');
    await p.setData({ stats: { ...fixtures().stats, roleCounts: [{ roleName: '梅林', games: 2 }] }, commonRoles: '梅林 2 局' }); await capture(p, 'me-role-statistics');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.ok(!calls.some(c => /auth\/wx-login/.test(c.url || '')), 'no account creation');
  } finally {
    // Return to an unauthenticated page before restoring the original local session.
    for (const key of ['AVALON_GAME_TOKEN', 'AVALON_LEGAL_CONSENT']) await mini.callWxMethod('removeStorageSync', key);
    await mini.reLaunch('/pages/login/login').catch(() => {});
    for (const method of mocked) await mini.restoreWxMethod(method);
    for (const [key, value] of [['AVALON_GAME_TOKEN', saved.token], ['AVALON_LEGAL_CONSENT', saved.consent]]) if (value) await mini.callWxMethod('setStorageSync', key, value);
    await mini.evaluate(() => { delete getApp().__v3Fixture; }); mini.disconnect();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
