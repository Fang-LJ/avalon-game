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
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), box, { file });
  return box.module.exports;
}

function pageAt(api = {}, wx = {}) {
  let page;
  moduleAt(
    'pages/room/room.js',
    {
      '../../services/avalon': api,
      '../../services/auth': { requireSession: () => true },
      '../../utils/socket': {},
    },
    { wx, Page: (value) => { page = value; }, setInterval: () => 1, clearInterval() {} },
  );
  page.data = structuredClone(page.data);
  page.setData = (values) => Object.assign(page.data, values);
  return page;
}

test('seat positions use seatNo and maxPlayers rather than response array index', () => {
  const ui = require('../utils/presentation');
  const ordered = ui.seats([
    { playerId: 1, seatNo: 1, nickname: '甲' },
    { playerId: 3, seatNo: 3, nickname: '丙' },
  ], [], null, 8);
  const shuffled = ui.seats([
    { playerId: 3, seatNo: 3, nickname: '丙' },
    { playerId: 1, seatNo: 1, nickname: '甲' },
  ], [], null, 8);
  assert.equal(ordered.find((p) => p.seatNo === 3).position, shuffled[0].position);
  assert.equal(ui.seatPosition(1, 8, true), ordered.find((p) => p.seatNo === 1).position);
});

test('waiting lobby always renders every fixed seat and marks empty seats', () => {
  const ui = require('../utils/presentation');
  const seats = ui.lobbySeats([{ playerId: 1, seatNo: 2, nickname: '乙' }], 5);
  assert.equal(seats.length, 5);
  assert.equal(seats[0].empty, true);
  assert.equal(seats[0].seatNo, 1);
  assert.equal(seats[1].nickname, '乙');
  assert.equal(seats[2].initial, '+');
});

test('empty seat invokes seat API and own seat action invokes stand API', async () => {
  const calls = [];
  let actionSheet;
  const page = pageAt(
    {
      seat: async (...args) => calls.push(['seat', ...args]),
      stand: async (...args) => calls.push(['stand', ...args]),
    },
    { showActionSheet: (options) => { actionSheet = options; } },
  );
  page.setData({ roomId: 7, room: { maxPlayers: 5 }, game: null });
  page.refresh = async () => {};
  await page.handleLobbySeat({ detail: { empty: true, seatNo: 3 } });
  page.handleLobbySeat({ detail: { me: true, seatNo: 1 } });
  actionSheet.success({ tapIndex: 0 });
  await new Promise(setImmediate);
  assert.deepEqual(calls, [['seat', 7, 3], ['stand', 7]]);
});

test('playing state ignores every lobby seat adjustment gesture', () => {
  let calls = 0;
  const page = pageAt({ seat: () => { calls++; }, stand: () => { calls++; } });
  page.setData({ roomId: 7, game: { phase: 'TEAM_BUILDING' } });
  page.handleLobbySeat({ detail: { empty: true, seatNo: 3 } });
  page.handleLobbySeat({ detail: { me: true, seatNo: 1 } });
  assert.equal(calls, 0);
});

test('private role overlay opens and closes without mutating game state', () => {
  const page = pageAt();
  const game = { gameId: 8, phase: 'TEAM_BUILDING', missionNo: 1 };
  page.setData({ game, role: { roleName: '梅林' } });
  page.openRoleOverlay();
  assert.equal(page.data.roleOverlay, true);
  page.closeRoleOverlay();
  assert.equal(page.data.roleOverlay, false);
  assert.deepEqual(page.data.game, game);
  const markup = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  assert.match(markup, /仅你可见/);
  assert.match(markup, /我的身份/);
  assert.doesNotMatch(markup, /showModal/);
});

test('private knowledge maps to safe identical symbols', () => {
  const ui = require('../utils/presentation');
  const evil = ui.privateKnowledge({ knowledgeType: 'EVIL' });
  const ally = ui.privateKnowledge({ knowledgeType: 'EVIL_ALLY' });
  const merlin = ui.privateKnowledge({ knowledgeType: 'MERLIN_OR_MORGANA' });
  const morgana = ui.privateKnowledge({ knowledgeType: 'MERLIN_OR_MORGANA' });
  assert.equal(evil.knowledgeSymbol, '');
  assert.equal(ally.knowledgeSymbol, '');
  assert.equal(evil.knowledgeClass, ally.knowledgeClass);
  assert.deepEqual(
    [merlin.knowledgeSymbol, merlin.knowledgeClass],
    [morgana.knowledgeSymbol, morgana.knowledgeClass],
  );
  assert.equal(merlin.knowledgeSymbol, '?');
});

test('role knowledge merges only into local display players and preserves exclusions', () => {
  const roomPlayers = [
    { playerId: 1, seatNo: 1, nickname: '我', me: true },
    { playerId: 2, seatNo: 2, nickname: '莫甘娜' },
    { playerId: 3, seatNo: 3, nickname: '莫德雷德' },
    { playerId: 4, seatNo: 4, nickname: '奥伯伦' },
    { playerId: 5, seatNo: 5, nickname: '忠臣' },
  ];
  const page = pageAt();
  page.setData({
    room: { maxPlayers: 5, players: roomPlayers, myPlayerId: 1 },
    game: { phase: 'TEAM_BUILDING', leaderPlayerId: 1 },
    role: {
      roleCode: 'MERLIN',
      visiblePlayers: [{ playerId: 2, knowledgeType: 'EVIL', hint: '邪恶阵营' }, { playerId: 4, knowledgeType: 'EVIL', hint: '邪恶阵营' }],
    },
    selectedIds: [2],
  });
  page.decoratePlayers();
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 2).knowledgeSymbol, '');
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 2).knowledgeClass, 'knowledge-evil');
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 3).knowledgeType, undefined);
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 2).selected, true);
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 1).leader, true);
  assert.equal(roomPlayers.some((p) => 'knowledgeType' in p || 'role' in p || 'alignment' in p), false);

  page.setData({ role: { roleCode: 'ASSASSIN', visiblePlayers: [{ playerId: 2, knowledgeType: 'EVIL_ALLY', hint: '邪恶同伴' }] } });
  page.decoratePlayers();
  assert.equal(page.data.displayPlayers.find((p) => p.playerId === 4).knowledgeType, undefined);

  page.setData({ role: { roleCode: 'LOYAL_SERVANT', visiblePlayers: [] } });
  page.decoratePlayers();
  assert.equal(page.data.displayPlayers.some((p) => p.knowledgeType), false);
});

test('leader selected private knowledge and me badges use independent layers', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../components/player-seat/player-seat.wxml'), 'utf8');
  assert.match(markup, /player\.leader/);
  assert.match(markup, /player\.selected/);
  assert.match(markup, /player\.knowledgeType/);
  assert.match(markup, /player\.me/);
  assert.match(markup, /leader-icon/);
  assert.match(markup, /player\.selectionClass/);
  assert.doesNotMatch(markup, /selected-icon/);
  assert.match(markup, /knowledge-icon/);
  assert.match(markup, /me-icon/);
});

test('rematch response switches the page to a waiting lobby, not role confirm', async () => {
  const waiting = {
    roomId: 90,
    roomCode: '123456',
    maxPlayers: 5,
    status: 'WAITING',
    currentGameId: null,
    players: [],
  };
  const page = pageAt({ room: async () => waiting });
  page.active = true;
  page.setData({ roomId: 90, game: { gameId: 50, phase: 'FINISHED' } });
  await page.fetchState();
  assert.equal(page.data.game, null);
  assert.equal(page.data.phaseTitle, '等待大厅');
  assert.equal(page.data.room.currentGameId, null);
});

test('seat and stand services use authenticated room endpoints', async () => {
  const calls = [];
  const api = moduleAt('services/avalon.js', {
    '../utils/request': { request: async (options) => calls.push(options) },
  });
  await api.seat(7, 3);
  await api.stand(7);
  assert.equal(calls[0].url, '/api/avalon/room/7/seat');
  assert.equal(calls[0].data.seatNo, 3);
  assert.equal(calls[1].url, '/api/avalon/room/7/stand');
});
