const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, globals, mocks = {}) {
  const context = {
    module: { exports: {} },
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    ...globals,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    context,
  );
  return context.module.exports;
}

function fixture(version = 'trial') {
  const logs = [];
  const wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }) };
  const console = {
    info: (...args) => logs.push(args),
    error: (...args) => logs.push(args),
  };
  const diagnostics = load('utils/diagnostics.js', { wx, console });
  return { wx, console, diagnostics, logs };
}

for (const version of ['trial', 'develop']) {
  test(`${version}: records native failure with safe URL/method/environment`, () => {
    const f = fixture(version);
    f.diagnostics.httpFail({
      url: 'https://api.example/avalon/api/auth/wx-login?code=hidden#token',
      method: 'POST',
      error: { errMsg: 'request:fail url not in domain list', stack: 'secret-stack' },
    });
    assert.equal(f.logs[0][0], '[HTTP FAIL]');
    assert.deepEqual(JSON.parse(JSON.stringify(f.logs[0][1])), {
      url: 'https://api.example/avalon/api/auth/wx-login',
      method: 'POST',
      errMsg: 'request:fail url not in domain list',
      envVersion: version,
    });
  });
}

for (const version of ['release', '', undefined, 'unexpected']) {
  test(`${String(version)}: technical logs stay disabled`, () => {
    const f = fixture(version);
    if (version === undefined) delete f.wx.getAccountInfoSync;
    f.diagnostics.httpFail({ error: { errMsg: 'request:fail SSL handshake error' } });
    f.diagnostics.httpResponse({ statusCode: 400 });
    f.diagnostics.loginEvent('wx.login started');
    assert.equal(f.logs.length, 0);
  });
}

test('diagnostic API/console failures do not interrupt business behavior', () => {
  const f = fixture();
  f.wx.getAccountInfoSync = () => { throw new Error('unavailable'); };
  assert.doesNotThrow(() => f.diagnostics.httpFail({}));
  f.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'trial' } });
  f.console.info = () => { throw new Error('unavailable'); };
  f.console.error = () => { throw new Error('unavailable'); };
  assert.doesNotThrow(() => f.diagnostics.loginEvent('wx.login started'));
  assert.doesNotThrow(() => f.diagnostics.httpFail({}));
  assert.equal(f.logs.length, 0);
});

test('redacts request credentials, opaque bearer tokens and URL query credentials', () => {
  const f = fixture();
  f.diagnostics.httpFail({
    url: 'https://user:password@api.example/login?token=query-secret',
    method: 'POST',
    data: { code: 'sensitive-wx-code', nested: { AppSecret: 'app-secret-value' } },
    header: { Authorization: 'Bearer opaque-auth-value' },
    error: {
      errMsg: 'request:fail sensitive-wx-code app-secret-value opaque-auth-value https://api.example/login?code=query-secret token=other-secret Bearer hidden-bearer eyJtest.payload.signature',
      token: 'do-not-log-raw-error',
    },
  });
  const printed = JSON.stringify(f.logs);
  for (const secret of ['password', 'query-secret', 'sensitive-wx-code', 'app-secret-value', 'opaque-auth-value', 'other-secret', 'hidden-bearer', 'eyJtest.payload.signature', 'do-not-log-raw-error'])
    assert.ok(!printed.includes(secret), secret);
  assert.match(printed, /request:fail/);
});

test('HTTP status logged without response body, token, headers or returned profile', () => {
  const f = fixture();
  f.diagnostics.httpResponse({
    url: 'https://api.example/login', method: 'POST', statusCode: 400,
    data: { token: 'sensitive-token' }, header: { Authorization: 'private' },
  });
  assert.equal(f.logs[0][1].statusCode, 400);
  assert.doesNotMatch(JSON.stringify(f.logs), /sensitive-token|private/);
});

function authFixture({ version = 'trial', failure = false, missingCode = false } = {}) {
  const f = fixture(version);
  const requests = [];
  const tokens = [];
  f.wx.login = (options) => {
    if (failure) options.fail({ errMsg: 'login:fail network error' });
    else options.success({ code: missingCode ? '' : 'never-print-this-code' });
  };
  f.auth = load('services/auth.js', { wx: f.wx }, {
    '../utils/diagnostics': f.diagnostics,
    '../utils/config': { getEnvironment: () => 'prod', getConfig: () => ({ mockLogin: false }) },
    '../utils/token': { setToken: (token) => tokens.push(token) },
    '../utils/request': { request: (request) => {
      requests.push(request);
      return Promise.resolve({ token: 'never-print-this-token' });
    } },
  });
  return { ...f, requests, tokens };
}

test('real login records stages but never code/token values', async () => {
  const f = authFixture();
  await f.auth.login();
  assert.deepEqual(f.logs.map((log) => log[1].stage), [
    'wx.login started', 'wx.login success: code received', 'auth wx-login request started',
  ]);
  assert.equal(f.requests[0].data.code, 'never-print-this-code');
  assert.equal(f.tokens[0], 'never-print-this-token');
  assert.doesNotMatch(JSON.stringify(f.logs), /never-print-this/);
});

test('wx.login failure identified before HTTP request starts', async () => {
  const f = authFixture({ failure: true });
  await assert.rejects(f.auth.login(), /微信登录失败/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.logs.at(-1)[1].stage, 'wx.login failed');
  assert.equal(f.logs.at(-1)[1].errMsg, 'login:fail network error');
});

test('missing wx code identified without sending an HTTP request', async () => {
  const f = authFixture({ missingCode: true });
  await assert.rejects(f.auth.login(), /微信未返回登录凭证/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.logs.at(-1)[1].stage, 'wx.login success: code missing');
});

test('release real login works without technical diagnostics', async () => {
  const f = authFixture({ version: 'release' });
  await f.auth.login();
  assert.equal(f.requests.length, 1);
  assert.equal(f.logs.length, 0);
});

test('wx.request transport failure preserves native error and friendly toast', async () => {
  const f = fixture();
  const toasts = [];
  const nativeError = { errMsg: 'request:fail SSL handshake error', errno: 600001 };
  f.wx.request = (options) => options.fail(nativeError);
  f.wx.showToast = (toast) => toasts.push(toast);
  const { request } = load('utils/request.js', { wx: f.wx }, {
    './config': { getConfig: () => ({ apiBaseUrl: 'https://api.example/avalon' }) },
    './token': { getToken: () => 'opaque-token' },
    './diagnostics': f.diagnostics,
  });
  await assert.rejects(request({ url: '/api/auth/wx-login', method: 'POST', data: { code: 'secret-code' } }), (error) => error === nativeError);
  assert.equal(toasts[0].title, '网络连接失败');
  assert.equal(f.logs[0][1].errMsg, nativeError.errMsg);
  assert.doesNotMatch(JSON.stringify(f.logs), /opaque-token|secret-code/);
});

test('HTTP business error records status and preserves application error', async () => {
  const f = fixture();
  f.wx.request = (options) => options.success({
    statusCode: 400, data: { code: 'WECHAT_LOGIN_FAILED', message: '微信登录失败' },
  });
  const { request } = load('utils/request.js', { wx: f.wx }, {
    './config': { getConfig: () => ({ apiBaseUrl: 'https://api.example/avalon' }) },
    './token': { getToken: () => '' }, './diagnostics': f.diagnostics,
  });
  await assert.rejects(request({ url: '/api/auth/wx-login', showError: false }), (error) => error.statusCode === 400 && error.code === 'WECHAT_LOGIN_FAILED');
  assert.equal(f.logs[0][0], '[HTTP RESPONSE]');
  assert.equal(f.logs[0][1].statusCode, 400);
});
