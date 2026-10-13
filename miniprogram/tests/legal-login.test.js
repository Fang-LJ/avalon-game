const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const flush = () => new Promise(setImmediate);
const plain = value => JSON.parse(JSON.stringify(value));
function fixture({ token = '', env = 'prod', deferredLogin = false, deferredRequest = false, documents = {} } = {}) {
  const storage = new Map(), calls = [], destinations = [], cache = new Map(); let page;
  if (token) storage.set('AVALON_GAME_TOKEN', token);
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, plain(value)), removeStorageSync: key => storage.delete(key),
    getWindowInfo: () => ({ statusBarHeight: 47 }), getMenuButtonBoundingClientRect: () => ({ bottom: 83 }),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }), showToast() {},
    login: options => { calls.push({ type: 'login', options }); if (!deferredLogin) options.success({ code: 'test-code' }); },
    request: options => {
      calls.push({ type: 'request', options });
      if (!deferredRequest) options.success({ statusCode: 200, data: { code: 'SUCCESS', data: options.url.endsWith('wx-login')
        ? { token: 'test-token', userId: 7, isNewUser: true, nickname: '微信玩家', avatarUrl: null, profileComplete: false }
        : { userId: 7, nickname: '微信玩家', avatarUrl: null, profileComplete: false } } });
    },
    reLaunch: o => destinations.push(o.url), navigateTo: o => destinations.push(o.url), navigateBack: () => destinations.push('back'),
    getUserProfile: () => { throw Error('No automatic profile authorization'); },
  };
  const config = { getConfig: () => ({ apiBaseUrl: 'https://mock.invalid', mockLogin: true }), getEnvironment: () => env };
  function load(file) {
    if (file.endsWith('/utils/config.js')) return config;
    if (documents[file]) return documents[file];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, wx, console, getCurrentPages: () => [{}],
      require: name => load(path.resolve(path.dirname(file), name + '.js')), Page: value => { page = value; } }, { filename: file });
    return module.exports;
  }
  const auth = load(path.join(root, 'services/auth.js')), consent = load(path.join(root, 'utils/legal-consent.js'));
  function open(name = 'login', options = {}) {
    const file = path.join(root, `pages/${name}/${name}.js`); cache.delete(file); load(file);
    const instance = page; instance.data = structuredClone(instance.data); instance.setData = value => Object.assign(instance.data, plain(value));
    instance.onLoad?.(options); instance.onShow?.(); return instance;
  }
  return { wx, auth, consent, storage, calls, destinations, open, load };
}
function loginCalls(f) { return f.calls.filter(c => c.type === 'login'); }
function requests(f) { return f.calls.filter(c => c.type === 'request'); }
test('fresh page is unchecked; button and handler both block login and registration', async () => {
  const f = fixture(), p = f.open(); await flush();
  assert.equal(p.data.agreed, false); assert.equal(p.data.checking, false); p.login(); await flush();
  await assert.rejects(f.auth.login(), /请先阅读并同意协议/);
  assert.equal(f.calls.length, 0); assert.equal(f.storage.has(f.consent.KEY), false);
  const markup = fs.readFileSync(path.join(root, 'pages/login/login.wxml'), 'utf8');
  assert.match(markup, /disabled="{{!agreed \|\| busy \|\| checking}}"/);
  assert.doesNotMatch(markup, /登录即代表同意|open-type="agreePrivacyAuthorization"/);
});
for (const type of ['agreement', 'privacy']) test(`reading ${type} does not record consent or invoke auth`, async () => {
  const f = fixture(), p = f.open();
  p.openLegal({ currentTarget: { dataset: { type } } }); p.onHide();
  const legal = f.open('legal', { type });
  const document = require(`../utils/legal/${type === 'privacy' ? 'privacy-policy' : 'user-agreement'}`);
  assert.deepEqual(legal.data.document, document); assert.ok(legal.data.document.sections.length > 0);
  legal.back(); p.onShow(); p.login(); await flush();
  assert.equal(p.data.agreed, false); assert.equal(f.storage.has(f.consent.KEY), false); assert.equal(f.calls.length, 0);
  assert.deepEqual(f.destinations, [`/pages/legal/legal?type=${type}`, '/pages/login/login']);
});
test('checkbox records both versions/time, can revoke, and never acts as WeChat platform authorization', async () => {
  const f = fixture(), p = f.open(); p.toggleAgreement();
  assert.equal(p.data.agreed, true); const r = f.consent.receipt();
  assert.equal(r.agreementVersion, '1.0.0'); assert.equal(r.privacyVersion, '1.0.0'); assert.ok(r.confirmedAt > 0);
  assert.equal(f.calls.length, 0); p.toggleAgreement(); assert.equal(p.data.agreed, false);
  p.login(); await flush(); assert.equal(f.calls.length, 0); assert.equal(f.consent.receipt(), null);
});
test('agreed login deduplicates clicks, binds receipt to the returned session and shows optional profile', async () => {
  const f = fixture(), p = f.open(); p.toggleAgreement(); p.login(); p.login(); p.login(); await flush();
  assert.equal(loginCalls(f).length, 1); assert.equal(requests(f).length, 1);
  assert.equal(requests(f)[0].options.url, 'https://mock.invalid/api/auth/wx-login');
  assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'test-token'); assert.equal(f.consent.receipt().userId, 7);
  assert.ok(f.consent.isCurrent('test-token')); assert.deepEqual(f.destinations, ['/pages/profile/profile']);
});
test('auth service concurrent login callers share one promise', async () => {
  const f = fixture({ deferredLogin: true }); f.auth.setAgreementConsent(true);
  const first = f.auth.login(), second = f.auth.login(); assert.equal(first, second);
  loginCalls(f)[0].options.success({ code: 'one-code' }); await first;
  assert.equal(loginCalls(f).length, 1); assert.equal(requests(f).length, 1);
});
test('old token cannot restore or enter formal pages without the current receipt, and remains untouched', async () => {
  const f = fixture({ token: 'old-token' }), p = f.open(); await flush();
  assert.equal(p.data.agreed, false); assert.equal(await f.auth.validateSession(), null); assert.equal(f.auth.requireSession(), false);
  p.login(); await assert.rejects(f.auth.login()); assert.equal(f.calls.length, 0);
  assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'old-token');
});
test('current explicit consent allows restoring an existing default profile without another wx.login', async () => {
  const f = fixture({ token: 'old-token' }); f.auth.setAgreementConsent(true); f.open(); await flush();
  assert.equal(loginCalls(f).length, 0); assert.equal(requests(f).length, 1); assert.equal(f.auth.requireSession(), true);
  assert.deepEqual(f.destinations, ['/pages/index/index']);
});
for (const field of ['agreementVersion', 'privacyVersion', 'documentsSignature', 'agreed', 'confirmedAt', 'schema'])
  test(`stale or malformed ${field} cannot bypass consent`, async () => {
    const f = fixture({ token: 'old-token' }); f.auth.setAgreementConsent(true);
    const record = f.storage.get(f.consent.KEY); record[field] = field === 'agreed' ? false : 'outdated';
    const p = f.open(); assert.equal(p.data.agreed, false); p.login(); await assert.rejects(f.auth.login());
    assert.equal(await f.auth.validateSession(), null); assert.equal(f.calls.length, 0);
    assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'old-token');
  });
test('updating protocol version or content invalidates an otherwise genuine local receipt', () => {
  const f = fixture(); f.auth.setAgreementConsent(true); const record = f.storage.get(f.consent.KEY);
  const doc = structuredClone(require('../utils/legal/privacy-policy')); doc.version = '1.0.1';
  const next = fixture({ documents: { [path.join(root, 'utils/legal/privacy-policy.js')]: doc } });
  next.storage.set(next.consent.KEY, record); assert.equal(next.consent.isCurrent(), false);
  doc.version = '1.0.0'; doc.sections[0].blocks[0].text += '更新';
  const edited = fixture({ documents: { [path.join(root, 'utils/legal/privacy-policy.js')]: doc } });
  edited.storage.set(edited.consent.KEY, record); assert.equal(edited.consent.isCurrent(), false);
});
test('replacing token cannot reuse a receipt bound to a different session', async () => {
  const f = fixture({ token: 'first-account' }); f.auth.setAgreementConsent(true);
  f.storage.set('AVALON_GAME_TOKEN', 'different-account'); f.open();
  assert.equal(await f.auth.validateSession(), null); assert.equal(f.calls.length, 0);
});
test('account mismatch during restoration requires consent again and retains account data', async () => {
  const f = fixture({ token: 'saved' }); f.auth.setAgreementConsent(true); f.consent.bindSession('saved', 99);
  assert.equal(await f.auth.validateSession(), null); assert.equal(f.consent.isCurrent(), false);
  assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'saved');
});
test('repeated page opening retains only genuine consent; logout clears consent and no game records', async () => {
  const f = fixture(); const p = f.open(); p.toggleAgreement(); p.onHide(); const again = f.open(); await flush();
  assert.equal(again.data.agreed, true); assert.equal(f.calls.length, 0);
  f.storage.set('formal-game', { id: 42 }); f.auth.logout();
  assert.equal(f.consent.isCurrent(), false); assert.deepEqual(f.storage.get('formal-game'), { id: 42 });
  assert.equal(f.open().data.agreed, false);
});
test('revoking consent while wx.login is pending stops the HTTP registration request', async () => {
  const f = fixture({ deferredLogin: true }), p = f.open(); p.toggleAgreement(); p.login(); await flush();
  p.toggleAgreement(); loginCalls(f)[0].options.success({ code: 'late-code' }); await flush();
  assert.equal(requests(f).length, 0); assert.equal(f.storage.has('AVALON_GAME_TOKEN'), false); assert.equal(p.data.agreed, false);
});
test('leaving before login microtask causes no wx.login or registration at all', async () => {
  const f = fixture(), p = f.open(); p.toggleAgreement(); p.login(); p.onHide(); await flush();
  assert.equal(f.calls.length, 0); assert.equal(f.destinations.length, 0);
});
test('leaving after wx.login starts blocks its late registration callback', async () => {
  const f = fixture({ deferredLogin: true }), p = f.open(); p.toggleAgreement(); p.login(); await flush();
  p.onHide(); loginCalls(f)[0].options.success({ code: 'late-code' }); await flush();
  assert.equal(requests(f).length, 0); assert.equal(f.destinations.length, 0);
});
test('revoking consent during an authorized HTTP login prevents token installation and redirect', async () => {
  const f = fixture({ deferredRequest: true }), p = f.open(); p.toggleAgreement(); p.login(); await flush();
  assert.equal(requests(f).length, 1); p.toggleAgreement();
  requests(f)[0].options.success({ statusCode: 200, data: { token: 'late-token', userId: 7 } }); await flush();
  assert.equal(f.storage.has('AVALON_GAME_TOKEN'), false); assert.equal(f.destinations.length, 0);
});
test('late restoration response cannot redirect after unchecking or leaving', async () => {
  for (const action of ['toggleAgreement', 'onHide']) {
    const f = fixture({ token: 'saved', deferredRequest: true }); f.auth.setAgreementConsent(true); const p = f.open();
    p[action](); requests(f)[0].options.success({ statusCode: 200, data: { userId: 7, nickname: '微信玩家' } }); await flush();
    assert.equal(f.destinations.length, 0); assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'saved');
  }
});
test('local mock still requires consent and production rejects mock switching', async () => {
  const f = fixture({ env: 'local' }); await assert.rejects(f.auth.selectMockUser('2')); assert.equal(f.calls.length, 0);
  f.auth.setAgreementConsent(true); await f.auth.selectMockUser('2');
  assert.equal(loginCalls(f).length, 0); assert.equal(requests(f)[0].options.data.mockOpenid, 'avalon_mock_2');
  const prod = fixture(); prod.auth.setAgreementConsent(true); await assert.rejects(prod.auth.selectMockUser('2')); assert.equal(prod.calls.length, 0);
});
test('storage failure cannot enable login', async () => {
  const f = fixture(), p = f.open(); f.wx.setStorageSync = () => { throw Error('Storage full'); };
  p.toggleAgreement(); assert.equal(p.data.agreed, false); p.login(); await assert.rejects(f.auth.login()); assert.equal(f.calls.length, 0);
});
test('four guest entries remain accessible while unchecked; two independent me links replace old legal modal', () => {
  const f = fixture(), p = f.open();
  for (const key of ['rules', 'roles', 'configuration', 'demo']) p.openGuestFeature({ currentTarget: { dataset: { key } } });
  assert.equal(f.destinations.length, 4); assert.equal(f.calls.length, 0);
  const me = fs.readFileSync(path.join(root, 'pages/me/me.wxml'), 'utf8'); assert.match(me, /bindtap="agreement"/); assert.match(me, /bindtap="privacy"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'utils/presentation.js'), 'utf8'), /showLegal/);
});
test('full agreement rendering covers every structured block kind with no truncation or read-to-end requirement', () => {
  const markup = fs.readFileSync(path.join(root, 'pages/legal/legal.wxml'), 'utf8');
  assert.match(markup, /document.sections/); assert.match(markup, /item.blocks/); assert.match(markup, /block.text/);
  assert.match(markup, /document.version/); assert.match(markup, /document.effectiveAt/); assert.match(markup, /guest-header/);
  assert.doesNotMatch(markup, /scrolltolower|readComplete|bindscroll|同意/);
  const css = fs.readFileSync(path.join(root, 'pages/legal/legal.wxss'), 'utf8'); assert.doesNotMatch(css, /line-clamp|overflow:\s*hidden/);
  for (const file of ['user-agreement', 'privacy-policy']) {
    const doc = require(`../utils/legal/${file}`); assert.ok(doc.sections.every(s => s.blocks.every(b => ['paragraph', 'bullet', 'subheading'].includes(b.kind))));
    assert.match(JSON.stringify(doc), /【开发者真实姓名】/); assert.match(JSON.stringify(doc), /【联系邮箱】/);
  }
  assert.match(JSON.stringify(require('../utils/legal/privacy-policy')), /【运行日志保存期限/);
});
test('a stale 401 from session restoration cannot erase a newer token or redirect', async () => {
  const f = fixture({ token: 'saved', deferredRequest: true }); f.auth.setAgreementConsent(true);
  const pending = f.auth.validateSession();
  f.storage.set('AVALON_GAME_TOKEN', 'new-token'); f.auth.setAgreementConsent(true);
  requests(f)[0].options.success({ statusCode: 401, data: { code: 'UNAUTHORIZED' } });
  assert.equal(await pending, null); assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'new-token'); assert.equal(f.destinations.length, 0);
});
test('a canceled restoration 401 and a failed explicit login both retain the old token', async () => {
  const f = fixture({ token: 'saved', deferredRequest: true }); f.auth.setAgreementConsent(true);
  const pending = f.auth.validateSession(); f.auth.setAgreementConsent(false);
  requests(f)[0].options.success({ statusCode: 401, data: { code: 'UNAUTHORIZED' } });
  await pending; assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'saved');
  f.auth.setAgreementConsent(true); const login = f.auth.login(); await flush();
  requests(f)[1].options.success({ statusCode: 401, data: { code: 'WECHAT_LOGIN_FAILED' } });
  await assert.rejects(login); assert.equal(f.storage.get('AVALON_GAME_TOKEN'), 'saved');
});
test('first profile can skip without update/upload and preserves a pending invite; nickname-only updates omit avatar', async () => {
  const f = fixture({ token: 'saved' }); f.auth.setAgreementConsent(true);
  f.load(path.join(root, 'utils/invite.js')).save('123456');
  const p = f.open('profile'); await flush();
  assert.equal(p.data.nickname, '微信玩家'); assert.equal(p.data.avatarUrl, ''); assert.equal(p.data.canSave, true);
  const before = requests(f).length; p.skip(); p.skip();
  assert.equal(requests(f).length, before); assert.deepEqual(f.destinations, ['/pages/join/join?roomCode=123456']);
  // A separate existing profile can save a nickname without forcing an avatar upload.
  const edit = f.open('profile', { mode: 'edit' }); await flush();
  edit.nicknameInput({ detail: { value: '默认头像玩家' } }); await edit.save();
  const update = requests(f).find(c => c.options.method === 'PUT');
  assert.deepEqual(plain(update.options.data), { nickname: '默认头像玩家' });
});
test('failed consent revocation still blocks all login calls in memory', async () => {
  const f = fixture(), p = f.open(); p.toggleAgreement();
  f.wx.removeStorageSync = () => { throw Error('Storage error'); }; p.toggleAgreement();
  assert.equal(p.data.agreed, false); await assert.rejects(f.auth.login()); assert.equal(f.calls.length, 0);
});
