const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function moduleAt(file, mocks = {}, globals = {}) {
  const box = {
    module: { exports: {} },
    exports: {},
    require: (p) =>
      p in mocks
        ? mocks[p]
        : require(path.resolve(__dirname, '..', path.dirname(file), p)),
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
    Page: (p) => {
      page = p;
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  page.data = structuredClone(page.data);
  page.setData = (v) => Object.assign(page.data, v);
  return page;
}
function authFixture(env, flag) {
  const store = {};
  let calls = [],
    wxLogins = 0;
  const token = {
    getToken: () => store.token,
    setToken: (t) => {
      store.token = t;
    },
    clearToken: () => {
      delete store.token;
    },
  };
  const wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    login: (o) => {
      wxLogins++;
      o.success({ code: 'wechat-code' });
    },
    reLaunch() {},
  };
  const auth = moduleAt(
    'services/auth.js',
    {
      '../utils/config': {
        getEnvironment: () => env,
        getConfig: () => ({ mockLogin: flag }),
      },
      '../utils/token': token,
      '../utils/request': {
        request: (o) => {
          calls.push(o);
          return Promise.resolve(
            o.url.endsWith('profile') ? { nickname: '测试' } : { token: 'jwt' },
          );
        },
      },
    },
    { wx },
  );
  return { auth, calls, store, wxLogins: () => wxLogins };
}
test('app launch never logs in', () => {
  let app;
  moduleAt(
    'app.js',
    {},
    {
      App: (a) => {
        app = a;
      },
    },
  );
  app.onLaunch();
  assert.doesNotMatch(
    fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'),
    /ensureLogin|wx.login/,
  );
});
test('production ignores mock flag and rejects switching', async () => {
  const f = authFixture('prod', true);
  await f.auth.login();
  assert.equal(f.wxLogins(), 1);
  assert.equal(f.calls[0].data.code, 'wechat-code');
  assert.equal(f.calls[0].data.mockOpenid, undefined);
  await assert.rejects(f.auth.selectMockUser('2'));
  assert.equal(f.calls.length, 1);
});
test('local mock needs both environment and flag, supports ten users', async () => {
  const f = authFixture('local', true);
  await f.auth.selectMockUser('10');
  assert.equal(f.calls[0].data.mockOpenid, 'avalon_mock_10');
  assert.equal(f.wxLogins(), 0);
  const disabled = authFixture('local', false);
  await disabled.auth.login();
  assert.equal(disabled.wxLogins(), 1);
});
test('empty session does not silently login; token validates profile only', async () => {
  const f = authFixture('prod', false);
  assert.equal(await f.auth.validateSession(), null);
  assert.equal(f.calls.length, 0);
  f.store.token = 'saved';
  await f.auth.validateSession();
  assert.equal(f.calls[0].url, '/api/avalon/me/profile');
  assert.equal(f.wxLogins(), 0);
});
test('login requires explicit button', async () => {
  let calls = 0,
    redirect;
  const auth = {
    isMockLogin: () => false,
    currentMockUser: () => ({ key: '1' }),
    validateSession: () => Promise.resolve(null),
    login: async () => {
      calls++;
    },
  };
  const page = pageAt(
    'pages/login/login.js',
    { '../../services/auth': auth },
    {
      reLaunch: (o) => {
        redirect = o.url;
      },
    },
  );
  page.onLoad();
  page.onShow();
  await new Promise(setImmediate);
  assert.equal(calls, 0);
  page.login();
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  assert.equal(redirect, '/pages/index/index');
});
test('invalid token clears session without wx.login', async () => {
  const token = {
    getToken: () => 'bad',
    clearToken() {
      this.cleared = true;
    },
  };
  const auth = moduleAt(
    'services/auth.js',
    {
      '../utils/config': {
        getEnvironment: () => 'prod',
        getConfig: () => ({}),
      },
      '../utils/token': token,
      '../utils/request': {
        request: () => Promise.reject({ statusCode: 401 }),
      },
    },
    { wx: {} },
  );
  assert.equal(await auth.validateSession(), null);
  assert.equal(token.cleared, true);
});
test('create and join never submit nickname; join validates six digits', async () => {
  const calls = [];
  const api = {
    createRoom: async (d) => {
      calls.push(d);
      return { roomId: 1 };
    },
    joinRoom: async (d) => {
      calls.push(d);
      return { roomId: 1 };
    },
  };
  const mocks = {
      '../../services/avalon': api,
      '../../services/auth': { requireSession: () => true },
    },
    wx = { redirectTo() {} };
  const create = pageAt('pages/create/create.js', mocks, wx);
  create.submit();
  await new Promise(setImmediate);
  assert.equal(calls[0].nickname, undefined);
  const join = pageAt('pages/join/join.js', mocks, wx);
  join.submit();
  assert.equal(calls.length, 1);
  join.codeInput({ detail: { value: '12ab3456' } });
  assert.equal(join.data.roomCode, '123456');
  join.submit();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].nickname, undefined);
});
test('query API methods use authenticated endpoints', async () => {
  const calls = [];
  const api = moduleAt('services/avalon.js', {
    '../utils/request': {
      request: (o) => {
        calls.push(o);
        return Promise.resolve();
      },
    },
  });
  await api.profile();
  await api.history(2, 10, 'GOOD');
  await api.stats();
  await api.timeline(12);
  await api.replay(12);
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      '/api/avalon/me/profile',
      '/api/avalon/me/games?page=2&size=10&alignment=GOOD',
      '/api/avalon/me/stats',
      '/api/avalon/game/12/timeline',
      '/api/avalon/game/12/replay',
    ],
  );
  assert.ok(calls.every((c) => c.requireAuth !== false));
});
test('5–10 seat layouts and rule previews are valid', () => {
  const ui = require('../utils/presentation');
  for (let n = 5; n <= 10; n++) {
    const seats = ui.seats(
      Array.from({ length: n }, (_, i) => ({
        playerId: i + 1,
        seatNo: i + 1,
        nickname: '玩家' + i,
      })),
      [1],
      2,
    );
    assert.equal(seats.length, n);
    assert.equal(new Set(seats.map((s) => s.position)).size, n);
    assert.equal(seats[0].selected, true);
    assert.equal(seats[1].leader, true);
    const rule = ui.rules(n);
    assert.equal(rule.good + rule.evil, n);
    assert.equal(rule.lady, n === 10);
    assert.equal(rule.fourth, n >= 7 ? 2 : 1);
  }
  assert.match(ui.rules(8).evilRoles, /爪牙/);
  assert.doesNotMatch(ui.rules(8).evilRoles, /奥伯伦|莫德雷德/);
});
test('live log never displays secret actions or Lady; ended replay does', () => {
  const { logs } = require('../utils/presentation');
  const players = [
    { playerId: 1, seatNo: 1, nickname: '甲', roleName: '刺客' },
  ];
  const t = {
    proposals: [
      {
        proposalId: 1,
        missionNo: 2,
        proposalNo: 1,
        teamPlayerIds: [1],
        status: 'APPROVED',
        votes: [],
      },
    ],
    missions: [
      {
        mission: { approvedProposalId: 1, missionNo: 2 },
        actions: [{ id: 1, gamePlayerId: 1, choice: 'FAIL' }],
      },
    ],
    ladyActions: [
      {
        sequenceNo: 1,
        holderGamePlayerId: 1,
        targetGamePlayerId: 1,
        resultAlignment: 'EVIL',
      },
    ],
  };
  assert.equal(logs(t, players)[0].actions.length, 0);
  assert.equal(logs(t, players)[0].ladyText, '');
  assert.equal(logs(t, players, true)[0].actions[0].playerText, '1 甲（刺客）');
  assert.match(logs(t, players, true)[0].ladyText, /EVIL/);
});
test('assassination requires explicit confirmation', async () => {
  let modal,
    calls = 0;
  const page = pageAt(
    'pages/room/room.js',
    {
      '../../services/avalon': {
        assassinate: async () => {
          calls++;
        },
      },
      '../../utils/socket': {},
    },
    {
      showModal: (o) => {
        modal = o;
      },
    },
  );
  page.setData({
    game: { gameId: 1 },
    assassinationTarget: 2,
    targetName: '玩家二',
  });
  page.run = (task) => task();
  page.assassinate();
  assert.equal(calls, 0);
  modal.success({ confirm: false });
  assert.equal(calls, 0);
  modal.success({ confirm: true });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
});
test('GOOD cannot select FAIL; mission waits for confirm', async () => {
  let chosen;
  const page = pageAt('pages/room/room.js', {
    '../../services/avalon': {
      mission: async (id, c) => {
        chosen = c;
      },
    },
    '../../utils/socket': {},
  });
  page.setData({ game: { gameId: 1, phase: 'MISSION_EXECUTING', onMission: true, evil: false } });
  page.run = (t) => t();
  page.missionFail();
  assert.equal(page.data.missionChoice, '');
  page.missionSuccess();
  assert.equal(chosen, undefined);
  await page.submitMission();
  assert.equal(chosen, 'SUCCESS');
});
test('phase changes clear selections, no continueRound', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../pages/room/room.js'),
    'utf8',
  );
  assert.match(source, /newPhase/);
  assert.doesNotMatch(source, /continueRound/);
  assert.match(source, /ladyResultGameId/);
});
test('seat rectangles stay in screen and above log at 375/390/430 widths', () => {
  const { seats } = require('../utils/presentation');
  for (const width of [375, 390, 430])
    for (let count = 5; count <= 10; count++) {
      const scale = width / 750,
        margin = 38 * scale,
        content = 674 * scale,
        height = (count >= 9 ? 900 : 720) * scale;
      // Formal avatars, number, bot label, optional nickname and 4rpx gaps.
      // Include the crown's 12rpx top overhang in every bounding rectangle.
      const seatWidth = (count >= 9 ? 112 : 128) * scale,
        seatHeight = ((count >= 9 ? 146 : count === 8 ? 160 : 188) + 12) * scale;
      const boxes = seats(
        Array.from({ length: count }, (_, i) => ({
          playerId: i + 1,
          seatNo: i + 1,
          nickname: '昵称',
        })),
        [],
        null,
        count,
      ).map((s) => {
        const [x, y] = s.position.match(/[\d.]+/g).map(Number);
        return {
          left: margin + (content * x) / 100 - seatWidth / 2,
          top: (height * y) / 100 - 12 * scale,
          width: seatWidth,
          height: seatHeight,
        };
      });
      for (const b of boxes) {
        assert.ok(b.left >= 0);
        assert.ok(b.left + b.width <= width);
        assert.ok(b.top >= 0);
        assert.ok(b.top + b.height <= height);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          assert.ok(
            a.left + a.width <= b.left ||
              b.left + b.width <= a.left ||
              a.top + a.height <= b.top ||
              b.top + b.height <= a.top,
            `${width}px / ${count} players: ${i},${j}`,
          );
        }
      const center = { left: margin + content * 0.25, top: height * 0.43, width: content * 0.5, height: 116 * scale };
      for (const b of boxes)
        assert.ok(center.left + center.width <= b.left || b.left + b.width <= center.left ||
          center.top + center.height <= b.top || b.top + b.height <= center.top,
        `${width}px / ${count} players: center overlaps seat`);
    }
});
test('all core room phase controls still invoke existing API methods', async () => {
  const calls = [];
  const api = Object.fromEntries(
    ['start', 'confirmRole', 'submitTeam', 'vote', 'mission', 'restart'].map(
      (name) => [name, async (...args) => calls.push([name, ...args])],
    ),
  );
  const p = pageAt('pages/room/room.js', {
    '../../services/avalon': api,
    '../../utils/socket': {},
  });
  p.setData({
    roomId: 7,
    game: { gameId: 9, phase: 'ROLE_CONFIRM', requiredTeamSize: 2 },
    role: { confirmed: false },
    identityRevealedGameId: 9,
    selectedIds: [1, 2],
    missionChoice: 'SUCCESS',
  });
  p.run = (t) => t();
  await p.startGame();
  await p.confirmRole({ detail: { gameId: 9 } });
  await p.submitTeam();
  await p.approve();
  await p.reject();
  p.setData({ game: { ...p.data.game, phase: 'MISSION_EXECUTING', onMission: true } });
  await p.submitMission();
  await p.restart();
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([
      ['start', 7],
      ['confirmRole', 9],
      ['submitTeam', 9, [1, 2]],
      ['vote', 9, 'APPROVE'],
      ['vote', 9, 'REJECT'],
      ['mission', 9, 'SUCCESS'],
      ['restart', 9],
    ]),
  );
});
test('Lady chooser excludes past holders and result stays private to current page', async () => {
  const p = pageAt('pages/room/room.js', {
    '../../services/avalon': {
      inspectLady: async () => ({ targetNickname: '乙', alignment: 'EVIL' }),
    },
    '../../utils/socket': {},
  });
  p.setData({
    room: {
      myPlayerId: 1,
      players: [
        { playerId: 1, seatNo: 1, nickname: '甲' },
        { playerId: 2, seatNo: 2, nickname: '乙' },
      ],
      maxPlayers: 5,
    },
    game: {
      gameId: 5,
      phase: 'LADY_OF_LAKE',
      ladyHolder: true,
      ladyEligibleTargetIds: [2],
    },
    selectedIds: [],
  });
  p.decoratePlayers();
  assert.equal(p.data.ladyPlayers.length, 1);
  assert.equal(p.data.ladyPlayers[0].playerId, 2);
  p.togglePlayer({ detail: { playerId: 1 } });
  assert.equal(p.data.ladyTarget, null);
  p.togglePlayer({ detail: { playerId: 2 } });
  p.run = (t) => t();
  await p.inspectLady();
  assert.equal(p.data.ladyResult.alignment, 'EVIL');
  assert.equal(p.data.entries.length, 0);
  p.dismissLady();
  assert.equal(p.data.ladyResult, null);
});
test('stale socket callbacks cannot close or reconnect a newer page session', () => {
  const sockets = [],
    timers = [];
  const socket = moduleAt(
    'utils/socket.js',
    {
      './config': { getConfig: () => ({ wsBaseUrl: 'wss://example.invalid' }) },
      './token': { getToken: () => 'test' },
    },
    {
      wx: {
        connectSocket() {
          const s = {
            onMessage(f) {
              this.message = f;
            },
            onClose(f) {
              this.closed = f;
            },
            onError() {},
            close() {
              this.closeCount = (this.closeCount || 0) + 1;
            },
          };
          sockets.push(s);
          return s;
        },
      },
      setTimeout: (f) => {
        timers.push(f);
        return 1;
      },
      clearTimeout() {},
    },
  );
  let events = 0;
  const oldStop = socket.connect(() => events++);
  const stop = socket.connect(() => events++);
  sockets[0].closed();
  sockets[0].message({ data: '{}' });
  oldStop();
  assert.equal(timers.length, 0);
  assert.equal(events, 0);
  assert.equal(sockets[1].closeCount, undefined);
  sockets[1].message({ data: '{}' });
  assert.equal(events, 1);
  stop();
  sockets[1].closed();
  assert.equal(timers.length, 0);
});
test('new game snapshot clears previous private Lady result and selections', async () => {
  const api = {
    room: async () => ({
      roomId: 1,
      currentGameId: 2,
      maxPlayers: 5,
      myPlayerId: 1,
      players: [],
    }),
    game: async () => ({
      gameId: 2,
      phase: 'ROLE_CONFIRM',
      missionNo: 1,
      proposalNo: 1,
      selectedPlayerIds: [],
    }),
    timeline: async () => ({ missions: [], proposals: [] }),
    myRole: async () => ({ roleCode: 'MERLIN', visiblePlayers: [] }),
  };
  const p = pageAt('pages/room/room.js', {
    '../../services/avalon': api,
    '../../utils/socket': {},
  });
  p.active = true;
  p.setData({
    roomId: 1,
    game: { gameId: 1 },
    selectedIds: [3],
    ladyResult: { alignment: 'EVIL' },
    ladyResultGameId: 1,
  });
  await p.fetchState();
  assert.equal(p.data.game.gameId, 2);
  assert.equal(p.data.selectedIds.length, 0);
  assert.equal(p.data.ladyResult, null);
  assert.equal(p.data.ladyResultGameId, null);
});
