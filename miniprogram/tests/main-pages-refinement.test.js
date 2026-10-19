const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function fixture(name, api = {}, extra = {}) {
  const storage = new Map(), routes = [];
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    hideKeyboard() {},
    navigateTo: options => { routes.push(options.url); if (options.success) options.success(); },
  };
  const inviteBox = { module: { exports: {} }, wx };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/invite.js'), 'utf8'), inviteBox);
  const invite = inviteBox.module.exports;
  let page;
  const mocks = {
    '../../services/auth': { requireSession: () => true },
    '../../services/avalon': api,
    '../../utils/presentation': { historyItem: value => value },
    '../../utils/history-presentation': { historyCard: value => value },
    '../../utils/invite': invite,
    '../../utils/guest-navigation': { readNavigationMetrics: () => ({ contentTop: 92 }) },
    ...extra.mocks,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8'), {
    Page: value => { page = value; }, require: name => mocks[name], wx, Date: extra.Date || Date,
  });
  page.data = structuredClone(page.data);
  page.setData = data => Object.assign(page.data, data);
  return { page, invite, wx, routes };
}
const input = (page, value) => page.joinInput({ detail: { value } });
const filter = (page, key) => page.filter({ currentTarget: { dataset: { key } } });
const stats = { totalGames: 2, wins: 1, losses: 1, winRate: 50 };

test('home recomputes local greetings on every show at all hour boundaries', () => {
  let hour = 0, loads = 0;
  const { page } = fixture('index', {}, { Date: class { getHours() { return hour; } } });
  page.load = () => loads++;
  for (const [value, expected] of [[0,'凌晨好'],[4,'凌晨好'],[5,'早上好'],[8,'早上好'],[9,'上午好'],[11,'上午好'],[12,'中午好'],[13,'中午好'],[14,'下午好'],[17,'下午好'],[18,'晚上好'],[23,'晚上好']]) {
    hour = value; page.onShow(); assert.equal(page.data.greeting, expected);
  }
  assert.equal(loads, 12);
});

test('manual join filters digits, validates with invite helper and rejects incomplete submission', async () => {
  let calls = 0;
  const { page, routes } = fixture('index', { joinRoom: async () => { calls++; return { roomId: 9 }; } });
  page.join(); assert.equal(page.data.joinOpen, true); assert.equal(routes.length, 0);
  assert.equal(input(page, 'a01-23'), '0123');
  await page.submitJoin(); assert.equal(calls, 0);
  assert.equal(input(page, 'a01-23456z'), '012345'); assert.equal(page.data.joinValid, true);
  await page.submitJoin(); assert.equal(calls, 1);
  assert.deepEqual(routes, ['/pages/room/room?roomId=9']); assert.equal(page.data.joinOpen, false);
});

test('manual join blocks repeated submit, editing and dismissal while pending, then allows retry', async () => {
  const request = deferred(); let calls = 0;
  const { page, invite } = fixture('index', { joinRoom: () => { calls++; return request.promise; } });
  page.join(); input(page, '000123'); const pending = page.submitJoin();
  await page.submitJoin(); page.closeJoin(); input(page, '999999');
  assert.equal(calls, 1); assert.equal(page.data.joinOpen, true); assert.equal(page.data.joinCode, '000123');
  request.reject(Error('房间已满')); await pending;
  assert.equal(page.data.joinError, '房间已满'); assert.equal(page.data.joining, false);
  assert.equal(invite.get(), '000123');
  input(page, '123456'); assert.equal(page.data.joinError, '');
  page.closeJoin(); assert.equal(invite.get(), ''); assert.equal(page.data.joinOpen, false);
});

test('manual join preserves login recovery and never clears a newer invitation', async () => {
  let session = true, calls = 0;
  const { page, invite } = fixture('index', { joinRoom: async () => { calls++; return { roomId: 9 }; } }, {
    mocks: { '../../services/auth': { requireSession: () => session } },
  });
  page.join(); input(page, '000123'); session = false; await page.submitJoin();
  assert.equal(calls, 0); assert.equal(invite.destinationOrHome(), '/pages/join/join?roomCode=000123');
  invite.save('222222'); page.closeJoin(); assert.equal(invite.get(), '222222');
  session = true; page.join(); input(page, '111111'); await page.submitJoin();
  assert.equal(invite.get(), '');
});

test('late join result clears only its own intent and cannot navigate an unloaded page', async () => {
  const request = deferred();
  const { page, invite, routes } = fixture('index', { joinRoom: () => request.promise });
  page.join(); input(page, '111111'); const pending = page.submitJoin();
  invite.save('222222'); page.onUnload(); request.resolve({ roomId: 9 }); await pending;
  assert.equal(invite.get(), '222222'); assert.equal(routes.length, 0);
});

test('failed room navigation releases the submit lock and keeps an actionable modal error', async () => {
  const { page, wx } = fixture('index', { joinRoom: async () => ({ roomId: 9 }) });
  wx.navigateTo = options => options.fail();
  page.join(); input(page, '000123'); await page.submitJoin();
  assert.equal(page.data.joinOpen, true); assert.equal(page.data.joining, false);
  assert.match(page.data.joinError, /页面打开失败/);
});

test('history toggles own alignment, switches exclusively and resets pagination', async () => {
  const calls = [];
  const { page } = fixture('history', {
    history: async (page, size, alignment) => { calls.push({ page, size, alignment }); return { items: [{ gameId: calls.length, alignment }], total: 21 }; },
    stats: async () => stats,
  });
  assert.equal(page.data.alignment, '');
  await page.load(true); await page.load();
  assert.equal(page.data.page, 2); assert.equal(page.data.items.length, 2);
  for (const [key, expected] of [['GOOD','GOOD'],['EVIL','EVIL'],['EVIL',''],['GOOD','GOOD'],['GOOD','']]) {
    await filter(page, key);
    assert.equal(page.data.alignment, expected); assert.equal(page.data.page, 1);
    assert.equal(page.data.items.length, 1); assert.equal(calls.at(-1).alignment, expected);
  }
  assert.deepEqual(plain(page.data.filters).map(f => f.key), ['GOOD', 'EVIL']);
});

test('rapid filters discard stale success/error without stopping the current spinner', async () => {
  const requests = [];
  const { page } = fixture('history', { history: () => { const request = deferred(); requests.push(request); return request.promise; }, stats: async () => stats });
  const old = filter(page, 'GOOD'), middle = filter(page, 'EVIL'), latest = filter(page, 'EVIL');
  requests[1].reject(Error('旧请求失败')); await middle;
  assert.equal(page.data.loading, true); assert.equal(page.data.error, '');
  requests[2].resolve({ items: [{ gameId: 3 }], total: 1 }); await latest;
  requests[0].resolve({ items: [{ gameId: 1 }], total: 10 }); await old;
  assert.equal(page.data.alignment, ''); assert.deepEqual(plain(page.data.items), [{ gameId: 3 }]);
  assert.equal(page.data.total, 1); assert.equal(page.data.loading, false);
});

test('filter switch invalidates pending load-more; retry resumes the correct page', async () => {
  const more = deferred(); let failure = true;
  const { page } = fixture('history', {
    history: (number, size, alignment) => {
      if (number === 2) return more.promise;
      if (alignment === 'EVIL' && failure) return Promise.reject(Error('network'));
      return Promise.resolve({ items: [{ gameId: alignment === 'EVIL' ? 20 : 1 }], total: 3 });
    }, stats: async () => stats,
  });
  await page.load(true); const pending = page.load();
  await filter(page, 'EVIL'); assert.equal(page.data.page, 0); assert.ok(page.data.error);
  failure = false; await page.load(page.data.page === 0);
  more.resolve({ items: [{ gameId: 2 }], total: 3 }); await pending;
  assert.deepEqual(plain(page.data.items), [{ gameId: 20 }]); assert.equal(page.data.page, 1);
  assert.equal(page.data.alignment, 'EVIL'); assert.equal(page.data.error, '');
});
