// Run in WeChat DevTools using an external miniprogram-automator install.
// All account/profile HTTP traffic is mocked; no real user or game is created.
const automator = require('miniprogram-automator');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const output = path.resolve(process.argv[2] || '/tmp/avalon-legal-native');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9422' });
  const keys = ['AVALON_GAME_TOKEN', 'AVALON_LEGAL_CONSENT', 'AVALON_MOCK_USER', 'AVALON_PENDING_INVITE_ROOM_CODE'];
  const saved = new Map(); for (const key of keys) saved.set(key, await mini.callWxMethod('getStorageSync', key));
  const checks = [], exceptions = [];
  mini.on('exception', e => { exceptions.push(e); console.error('MINI_EXCEPTION', e); });
  const check = (value, name) => { assert.ok(value, name); checks.push(name); };
  const snapshot = async name => mini.screenshot({ path: path.join(output, name + '.png') });
  async function launch(route) {
    await mini.reLaunch(route);
    for (let i = 0; i < 40; i++) {
      const p = await mini.currentPage(); if (p && p.path === route.split('?')[0].slice(1)) { await p.waitFor(150); return p; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Did not open ' + route);
  }
  try {
    for (const key of keys) await mini.callWxMethod('removeStorageSync', key);
    await launch('/pages/login/login'); await (await mini.currentPage()).waitFor(1800);
    await mini.evaluate(() => { getApp().__legalCalls = []; });
    await mini.mockWxMethod('login', function (options) {
      getApp().__legalCalls.push('wx.login'); return { code: 'legal-test-code' };
    });
    await mini.mockWxMethod('request', function (options) {
      getApp().__legalCalls.push(options.url);
      let data;
      if (options.url.endsWith('/api/auth/wx-login')) data = { token: 'legal-test-token', userId: 901, nickname: '微信玩家', avatarUrl: null, isNewUser: true, profileComplete: false };
      else if (options.url.endsWith('/me/profile')) data = { userId: 901, nickname: '微信玩家', avatarUrl: null, profileComplete: false };
      else if (options.url.includes('/me/games')) data = { items: [], total: 0 };
      else if (options.url.endsWith('/me/stats')) data = { totalGames: 0, winRate: 0, roleCounts: [] };
      else data = null;
      return { statusCode: 200, data: { code: 'SUCCESS', data } };
    });
    for (const method of ['getUserProfile', 'connectSocket', 'uploadFile'])
      await mini.mockWxMethod(method, function () { throw Error('Unexpected private API in legal QA'); });
    let page = await launch('/pages/login/login');
    check((await page.data('agreed')) === false, 'fresh login unchecked');
    check(await (await page.$('.login-button')).property('disabled'), 'login disabled');
    await page.callMethod('login');
    check((await mini.evaluate(() => getApp().__legalCalls)).length === 0, 'unchecked login zero API calls');
    check((await page.$$('.guest-feature')).length === 4, 'four guest modules retained');
    const circle = await (await page.$('.agreement-circle')).size(), hot = await (await page.$('.agreement-checkbox')).size();
    const copyFont = parseFloat(await (await page.$('.agreement-copy')).style('font-size'));
    check(Math.abs(circle.width - copyFont) <= 1 && circle.width === circle.height, 'circle matches agreement text size');
    check(await page.$('.login-actions .footer-note') === null, 'account creation caption removed');
    check(hot.width >= 44 && hot.height >= 44, '44px checkbox touch target');
    check(await page.$('.agreement-hint') === null, 'no constant consent hint');
    await snapshot('login-unchecked');
    const texts = await Promise.all((await page.$$('text')).map(e => e.text()));
    fs.writeFileSync(path.join(output, 'login-dom.json'), JSON.stringify({ wxml: await (await page.$('.page')).outerWxml(), texts }));
    for (const type of ['agreement', 'privacy']) {
      await (await page.$(`[data-type="${type}"]`)).tap(); await page.waitFor(500); page = await mini.currentPage();
      check(page.path === 'pages/legal/legal', 'open full ' + type);
      const document = await page.data('document');
      check(document.version === '1.0.1', 'current legal revision ' + type);
      const rendered = await Promise.all((await page.$$('.legal-block')).map(e => e.text()));
      check(rendered.some(text => text.includes('方良军')) && rendered.some(text => text.includes('842515974@qq.com')), 'public identity and email ' + type);
      check(rendered.every(text => !text.includes('mailto:') && !text.includes('【开发者真实姓名】') && !text.includes('【联系邮箱】')), 'email displays without raw link markup ' + type);
      check(document.key === (type === 'privacy' ? 'privacy-policy' : 'user-agreement'), 'correct document ' + type);
      check((await page.$$('.legal-section')).length === document.sections.length, 'all chapters ' + type);
      const blocks = document.sections.flatMap(s => s.blocks);
      check((await page.$$('.legal-block')).length === blocks.length, 'all paragraphs ' + type);
      check(!!(await page.$('.legal-metadata')), 'version and effective date ' + type);
      const header = await page.$('guest-header'), back = await header.$('.back'), before = await back.offset();
      const system = await mini.systemInfo(), capsule = await mini.evaluate(() => wx.getMenuButtonBoundingClientRect());
      check(before.top >= system.statusBarHeight && before.left + (await back.size()).width < capsule.left, 'safe return ' + type);
      await snapshot(type);
      await mini.callWxMethod('pageScrollTo', { scrollTop: 1000, duration: 0 }); await page.waitFor(100);
      check(Math.abs((await back.offset()).top - (await page.scrollTop()) - before.top) < 1, 'fixed scrolling return ' + type);
      await snapshot(type + '-scrolled'); await back.tap(); await page.waitFor(500); page = await mini.currentPage();
      check(page.path === 'pages/login/login' && !(await page.data('agreed')), 'reading alone does not agree ' + type);
      check(await (await page.$('.login-button')).property('disabled'), 'still disabled after reading ' + type);
    }
    check((await mini.evaluate(() => getApp().__legalCalls)).length === 0, 'reading zero login or backend calls');
    await (await page.$('.agreement-checkbox')).tap();
    check(await page.data('agreed'), 'explicit checkbox agrees');
    check(!(await (await page.$('.login-button')).property('disabled')), 'agreed login enabled');
    const receipt = await mini.callWxMethod('getStorageSync', 'AVALON_LEGAL_CONSENT');
    check(!!receipt.confirmedAt && receipt.agreementVersion && receipt.privacyVersion, 'versioned timed receipt');
    await snapshot('login-agreed');
    await (await page.$('.agreement-checkbox')).tap(); check(!(await page.data('agreed')), 'uncheck revokes');
    await page.callMethod('login'); check((await mini.evaluate(() => getApp().__legalCalls)).length === 0, 'revoked zero login or account calls');
    await mini.callWxMethod('setStorageSync', 'AVALON_GAME_TOKEN', 'legacy-test-token');
    page = await launch('/pages/login/login'); check(!(await page.data('agreed')), 'old token does not bypass consent');
    check((await mini.evaluate(() => getApp().__legalCalls)).length === 0, 'no legacy automatic profile request');
    check(await mini.callWxMethod('getStorageSync', 'AVALON_GAME_TOKEN') === 'legacy-test-token', 'legacy token preserved');
    await (await page.$('.agreement-checkbox')).tap(); await (await page.$('.login-button')).tap(); await page.waitFor(600);
    page = await mini.currentPage(); check(page.path === 'pages/profile/profile', 'agreed first login offers optional profile');
    check((await page.data('nickname')) === '微信玩家', 'default nickname retained');
    await snapshot('profile-optional'); await (await page.$('.profile-skip')).tap(); await page.waitFor(600);
    check((await mini.currentPage()).path === 'pages/index/index', 'skip reaches formal home with default profile');
    page = await launch('/pages/me/me'); check(!!(await page.data('profile')), 'logged-in me loads');
    for (const type of ['agreement', 'privacy']) {
      await page.callMethod(type); await page.waitFor(500); page = await mini.currentPage();
      check(page.path === 'pages/legal/legal', 'me independent ' + type + ' entry');
      await (await (await page.$('guest-header')).$('.back')).tap(); await page.waitFor(500); page = await mini.currentPage();
      check(page.path === 'pages/me/me', 'legal stack returns to me');
    }
    const changed = await mini.callWxMethod('getStorageSync', 'AVALON_LEGAL_CONSENT'); changed.privacyVersion = 'obsolete';
    await mini.callWxMethod('setStorageSync', 'AVALON_LEGAL_CONSENT', changed);
    page = await launch('/pages/login/login'); check(!(await page.data('agreed')), 'protocol update needs new agreement');
    check(await (await page.$('.login-button')).property('disabled'), 'updated protocol disables login');
    check(exceptions.length === 0, 'no runtime exceptions');
    const calls = await mini.evaluate(() => getApp().__legalCalls);
    check(calls.filter(c => c === 'wx.login').length === 1, 'only explicitly approved wx.login');
    check(calls.filter(c => c.endsWith('/api/auth/wx-login')).length === 1, 'only explicitly approved account request');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks: checks.length, calls, system: await mini.systemInfo() }, null, 2));
    console.log('NATIVE_LEGAL_PASS', checks.length, output);
  } finally {
    try { const p = await mini.currentPage(); if (p.path === 'pages/login/login') await p.callMethod('onHide'); } catch (_) {}
    for (const method of ['login', 'request', 'getUserProfile', 'connectSocket', 'uploadFile']) await mini.restoreWxMethod(method);
    for (const [key, value] of saved) { if (value) await mini.callWxMethod('setStorageSync', key, value); else await mini.callWxMethod('removeStorageSync', key); }
    await mini.evaluate(() => { delete getApp().__legalCalls; }); mini.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
