const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function moduleAt(file, mocks = {}, globals = {}) {
  const box = {
    module: { exports: {} },
    exports: {},
    require: (request) =>
      request in mocks
        ? mocks[request]
        : require(path.resolve(__dirname, '..', path.dirname(file), request)),
    ...globals,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    box,
    { filename: file },
  );
  return box.module.exports;
}

function pageAt(file, mocks = {}, wx = {}) {
  let page;
  moduleAt(file, mocks, {
    wx,
    Page: (definition) => {
      page = definition;
    },
  });
  page.data = structuredClone(page.data);
  page.setData = (values) => Object.assign(page.data, values);
  return page;
}

function loginPage({ mock = false, profile, loginResult, agreed = false } = {}) {
  let destination;
  const auth = {
    hasAgreementConsent: () => agreed,
    setAgreementConsent: value => { agreed = value; },
    cancelLogin() {},
    isMockLogin: () => mock,
    currentMockUser: () => ({ key: '1' }),
    validateSession: () => Promise.resolve(profile || null),
    login: () => Promise.resolve(loginResult || {}),
  };
  const page = pageAt(
    'pages/login/login.js',
    { '../../services/auth': auth },
    { reLaunch: ({ url }) => { destination = url; } },
  );
  return { page, destination: () => destination };
}

test('new user sees optional profile; an existing default-profile session goes home', async () => {
  const fresh = loginPage({ loginResult: { isNewUser: true, profileComplete: false } });
  fresh.page.onLoad();
  fresh.page.onShow(); fresh.page.toggleAgreement();
  fresh.page.login();
  await new Promise(setImmediate);
  assert.equal(fresh.destination(), '/pages/profile/profile');

  const existing = loginPage({ agreed: true, profile: { avatarUrl: null, profileComplete: false } });
  existing.page.onLoad();
  existing.page.onShow();
  await new Promise(setImmediate);
  assert.equal(existing.destination(), '/pages/index/index');
});

test('complete production profile routes home while local mock bypasses profile', async () => {
  const complete = loginPage({ loginResult: { profileComplete: true } });
  complete.page.onLoad();
  complete.page.onShow(); complete.page.toggleAgreement();
  complete.page.login();
  await new Promise(setImmediate);
  assert.equal(complete.destination(), '/pages/index/index');

  const mock = loginPage({ mock: true, loginResult: { isNewUser: true, profileComplete: false } });
  mock.page.onLoad();
  mock.page.onShow(); mock.page.toggleAgreement();
  mock.page.login();
  await new Promise(setImmediate);
  assert.equal(mock.destination(), '/pages/index/index');
});

test('chooseAvatar uploads the temp path and updates the permanent preview', async () => {
  let uploaded;
  const page = pageAt(
    'pages/profile/profile.js',
    {
      '../../services/avalon': {},
      '../../services/auth': {},
      '../../services/file': {
        uploadAvatar: async (pathValue) => {
          uploaded = pathValue;
          return { url: 'https://files.invalid/avatar.png' };
        },
      },
      '../../utils/presentation': { initial: (name) => name[0] || 'A' },
    },
    { showToast() {} },
  );
  page.nicknameInput({ detail: { value: '玩家甲' } });
  await page.handleChooseAvatar({ detail: { avatarUrl: 'wxfile://temporary' } });
  assert.equal(uploaded, 'wxfile://temporary');
  assert.equal(page.data.avatarUrl, 'https://files.invalid/avatar.png');
  assert.equal(page.data.canSave, true);
});

test('nickname field supports WeChat suggestions and manual editing while avatar stays optional', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.wxml'), 'utf8');
  assert.match(markup, /open-type="chooseAvatar"/);
  assert.match(markup, /type="nickname"/);
  assert.match(markup, /maxlength="32"/);

  const page = pageAt(
    'pages/profile/profile.js',
    {
      '../../services/avalon': {},
      '../../services/auth': {},
      '../../services/file': {},
      '../../utils/presentation': { initial: (name) => name[0] || 'A' },
    },
    { showToast() {} },
  );
  page.syncCanSave();
  assert.equal(page.data.canSave, false);
  page.setData({ avatarUrl: 'https://files.invalid/avatar.png', nickname: '   ' });
  page.syncCanSave();
  assert.equal(page.data.canSave, false);
});

test('first profile save relaunches home exactly once', async () => {
  let updates = 0;
  const destinations = [];
  const page = pageAt(
    'pages/profile/profile.js',
    {
      '../../services/avalon': { updateProfile: async (data) => { updates++; assert.equal(data.nickname, '玩家甲'); } },
      '../../services/auth': {},
      '../../services/file': {},
      '../../utils/presentation': { initial: () => '玩' },
    },
    { reLaunch: ({ url }) => destinations.push(url), showToast() {} },
  );
  page.setData({ nickname: ' 玩家甲 ', avatarUrl: 'https://files.invalid/avatar.png' });
  page.syncCanSave();
  await page.save();
  await page.save();
  assert.equal(updates, 1);
  assert.deepEqual(destinations, ['/pages/index/index']);
});

test('avatar upload service sends bearer JWT to the authenticated endpoint', async () => {
  let request;
  const service = moduleAt(
    'services/file.js',
    {
      '../utils/config': { getConfig: () => ({ apiBaseUrl: 'https://api.invalid/avalon' }) },
      '../utils/token': { getToken: () => 'jwt-value', clearToken() {} },
    },
    {
      wx: {
        uploadFile(options) {
          request = options;
          options.success({ statusCode: 200, data: JSON.stringify({ code: 'SUCCESS', data: { url: 'https://files.invalid/a.png' } }) });
        },
      },
    },
  );
  const result = await service.uploadAvatar('wxfile://avatar');
  assert.equal(request.url, 'https://api.invalid/avalon/api/avalon/me/avatar');
  assert.equal(request.name, 'file');
  assert.equal(request.header.Authorization, 'Bearer jwt-value');
  assert.equal(result.url, 'https://files.invalid/a.png');
});

test('me page opens profile edit and seats retain avatar fallback support', () => {
  const me = fs.readFileSync(path.join(__dirname, '../pages/me/me.js'), 'utf8');
  const meMarkup = fs.readFileSync(path.join(__dirname, '../pages/me/me.wxml'), 'utf8');
  const seat = fs.readFileSync(path.join(__dirname, '../components/player-seat/player-seat.wxml'), 'utf8');
  assert.match(me, /pages\/profile\/profile\?mode=edit/);
  assert.match(meMarkup, /编辑头像与昵称/);
  assert.match(seat, /wx:if="\{\{player\.avatarUrl\}\}"/);
  assert.match(seat, /<text wx:else>\{\{player\.initial\}\}<\/text>/);
});

test('avatar sources open only after user interaction and freeze during upload or save', () => {
  const page = pageAt('pages/profile/profile.js', {}, {});
  page.setData({ loading: false }); page.openAvatarSheet();
  assert.equal(page.data.avatarSheetOpen, true);
  page.closeAvatarSheet(); page.setData({ uploading: true }); page.openAvatarSheet();
  assert.equal(page.data.avatarSheetOpen, false);
  page.setData({ uploading: false, saving: true }); page.openAvatarSheet();
  assert.equal(page.data.avatarSheetOpen, false);
});
test('WeChat nickname shortcut only focuses the editable field, blur preserves manual input and validation', () => {
  const page = pageAt('pages/profile/profile.js', {}, { nextTick: callback => callback() });
  page.setData({ loading: false }); page.focusNickname();
  assert.equal(page.data.nicknameFocused, true);
  page.nicknameBlur({ detail: { value: '手动昵称' } });
  assert.equal(page.data.nickname, '手动昵称'); assert.equal(page.data.nicknameFocused, false); assert.equal(page.data.canSave, true);
  page.nicknameBlur({ detail: { value: '   ' } }); assert.equal(page.data.canSave, false);
});
test('refusing album privacy keeps existing avatar and allows reopening source sheet', async () => {
  const page = pageAt('pages/profile/profile.js', { '../../services/file': { chooseImage: async () => { throw Error('保留默认头像'); } } }, { showToast() {} });
  page.setData({ loading: false, avatarUrl: 'existing-avatar' }); page.openAvatarSheet(); await page.chooseFromAlbum();
  assert.equal(page.data.avatarUrl, 'existing-avatar'); assert.equal(page.data.uploading, false); assert.equal(page.data.avatarSheetOpen, false);
  page.openAvatarSheet(); assert.equal(page.data.avatarSheetOpen, true);
});
