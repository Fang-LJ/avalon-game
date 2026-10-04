const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');

function pageAt(api = {}, wx = {}) {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/room/room.js'), 'utf8'), {
    require: name => ({
      '../../services/avalon': api,
      '../../services/auth': {},
      '../../utils/socket': {},
      '../../utils/presentation': ui,
      '../../utils/cards': require('../utils/cards'),
    })[name],
    wx, Page: value => { page = value; }, clearInterval() {},
  });
  page.data = structuredClone(page.data);
  page.setData = values => Object.assign(page.data, values);
  page.active = true;
  page.refresh = async () => {};
  page.setData({ roomId: 7, room: { roomId: 7, host: true, maxPlayers: 5, currentPlayers: 1, players: [] } });
  return page;
}

test('host can add a bot only in a non-full waiting lobby', async () => {
  const calls = [];
  const page = pageAt({ addBot: async id => calls.push(id) });
  await page.addBot();
  page.data.room.currentPlayers = 5;
  await page.addBot();
  page.data.room.currentPlayers = 1;
  page.data.game = { phase: 'TEAM_BUILDING' };
  await page.addBot();
  page.data.game = null;
  page.data.room.host = false;
  await page.addBot();
  assert.deepEqual(calls, [7]);
});
test('bot removal cannot remove humans or operate after game start', async () => {
  const calls = [];
  const page = pageAt({ removeBot: async (...args) => calls.push(args) });
  page.data.room.players = [{ playerId: 3, isBot: true }, { playerId: 2, isBot: false }];
  await page.removeBot(3);
  await page.removeBot(2);
  page.data.game = { phase: 'ROLE_CONFIRM' };
  await page.removeBot(3);
  assert.deepEqual(calls, [[7, 3]]);
});
test('host removes a bot through its lobby avatar menu rather than a separate list', async () => {
  let menu;
  const calls = [];
  const page = pageAt({ removeBot: async (...args) => calls.push(args) }, {
    showActionSheet: options => { menu = options; },
  });
  page.data.room.players = [{ playerId: 3, seatNo: 2, isBot: true }];
  page.handleLobbySeat({ detail: { playerId: 3, seatNo: 2 } });
  assert.equal(menu.itemList.length, 1);
  assert.equal(menu.itemList[0], '移除2号机器人');
  assert.equal(calls.length, 0);
  menu.success({ tapIndex: 0 });
  await new Promise(setImmediate);
  assert.deepEqual(calls, [[7, 3]]);
  const markup = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  assert.doesNotMatch(markup, /bot-list|bot-row|机器人测试局/);
  assert.match(markup, /点击机器人头像可移除/);
});
test('bot avatar actions are unavailable for guests humans busy and playing states', () => {
  let menus = 0;
  const page = pageAt({}, { showActionSheet() { menus++; } });
  page.data.room.players = [{ playerId: 3, seatNo: 2, isBot: true }, { playerId: 2, isBot: false }];
  page.data.room.host = false;
  page.handleLobbySeat({ detail: { playerId: 3 } });
  page.data.room.host = true;
  page.handleLobbySeat({ detail: { playerId: 2 } });
  page.data.busy = true;
  page.handleLobbySeat({ detail: { playerId: 3 } });
  page.data.busy = false;
  page.data.game = { phase: 'ROLE_CONFIRM' };
  page.handleLobbySeat({ detail: { playerId: 3 } });
  assert.equal(menus, 0);
});
test('open bot menu rechecks lobby room owner and membership before removal', async () => {
  for (const change of [
    page => { page.data.game = { phase: 'ROLE_CONFIRM' }; },
    page => { page.data.roomId = 8; },
    page => { page.data.room.host = false; },
    page => { page.data.room.players = []; },
  ]) {
    let menu;
    const calls = [];
    const page = pageAt({ removeBot: async () => calls.push('removed') }, {
      showActionSheet: options => { menu = options; },
    });
    page.data.room.players = [{ playerId: 3, seatNo: 2, isBot: true }];
    page.handleLobbySeat({ detail: { playerId: 3 } });
    change(page);
    menu.success({ tapIndex: 0 });
    await new Promise(setImmediate);
    assert.equal(calls.length, 0);
  }
});
test('a refresh completing before bot removal rechecks current owner and game', async () => {
  const calls = [];
  const page = pageAt({ removeBot: async () => calls.push('removed') });
  page.data.room.players = [{ playerId: 3, isBot: true }];
  page.refreshing = Promise.resolve().then(() => { page.data.room.host = false; });
  await page.removeBot(3);
  assert.equal(calls.length, 0);
});
test('bot marker survives table decoration without disclosing identities', () => {
  const player = { playerId: 4, seatNo: 2, nickname: '机器人1', isBot: true, seated: true };
  const page = pageAt();
  page.data.room.players = [player];
  page.decoratePlayers();
  assert.equal(page.data.botPlayers.length, 1);
  assert.equal(page.data.displayPlayers[1].isBot, true);
  page.data.game = { phase: 'TEAM_BUILDING', leaderPlayerId: 4 };
  page.decoratePlayers();
  assert.equal(page.data.displayPlayers[0].isBot, true);
  assert.equal(page.data.displayPlayers[0].role, undefined);
  assert.equal(page.data.displayPlayers[0].alignment, undefined);
});
test('host termination requires explicit confirmation and preserves real-game finished screen', async () => {
  let dialog;
  const calls = [];
  const page = pageAt({ endGame: async id => { calls.push(id); return { closed: false }; } }, {
    showModal: options => { dialog = options; },
  });
  page.data.game = { gameId: 7, phase: 'MISSION_EXECUTING' };
  page.endGame();
  dialog.success({ confirm: false });
  assert.equal(calls.length, 0);
  dialog.success({ confirm: true });
  await new Promise(setImmediate);
  assert.deepEqual(calls, [7]);
  assert.equal(page.active, true);
});
test('host-ending a test game returns home and does not request deleted state', async () => {
  let dialog, destination;
  const page = pageAt({ endGame: async () => ({ closed: true }) }, {
    showModal: options => { dialog = options; },
    showToast() {}, reLaunch: options => { destination = options.url; },
  });
  page.data.room.testGame = true;
  page.data.game = { phase: 'TEAM_BUILDING' };
  page.refresh = async () => { throw new Error('must not fetch deleted game'); };
  page.endGame();
  assert.match(dialog.content, /不保留记录/);
  dialog.success({ confirm: true });
  await new Promise(setImmediate);
  assert.equal(destination, '/pages/index/index');
  assert.equal(page.active, false);
});
test('ordinary players and terminal state cannot open host termination control', () => {
  let dialogs = 0;
  const page = pageAt({}, { showModal() { dialogs++; } });
  page.data.room.host = false;
  page.endGame();
  page.data.room.host = true;
  page.data.game = { phase: 'FINISHED' };
  page.endGame();
  assert.equal(dialogs, 0);
});
test('stale confirmation cannot end a rematch lobby', async () => {
  let dialog, calls = 0;
  const page = pageAt({ endGame: async () => { calls++; } }, { showModal: options => { dialog = options; } });
  page.endGame();
  page.data.roomId = 8;
  dialog.success({ confirm: true });
  await new Promise(setImmediate);
  assert.equal(calls, 0);
});
test('ROOM_CLOSED websocket exits all active clients exactly once', () => {
  let exits = 0;
  const page = pageAt({}, { showToast() {}, reLaunch() { exits++; } });
  page.handleRoomEvent({ roomId: 6, type: 'ROOM_CLOSED' });
  assert.equal(exits, 0);
  page.handleRoomEvent({ roomId: 7, type: 'ROOM_CLOSED' });
  page.handleRoomEvent({ roomId: 7, type: 'ROOM_CLOSED' });
  assert.equal(exits, 1);
});
test('REMATCH_CREATED websocket migrates to new lobby after old test data is removed', () => {
  const page = pageAt();
  let refreshed;
  page.refresh = () => { refreshed = page.data.roomId; };
  page.handleRoomEvent({ roomId: 8, type: 'REMATCH_CREATED' });
  assert.equal(page.data.roomId, 8);
  assert.equal(refreshed, 8);
});
test('finished test-game summary never requests permanent replay', async () => {
  const page = pageAt({
    room: async () => ({ roomId: 7, currentGameId: 7, testGame: true, maxPlayers: 5, players: [], myPlayerId: 1 }),
    game: async () => ({ gameId: 7, phase: 'FINISHED', finishReason: 'ASSASSINATION_MISSED', ladyEligibleTargetIds: [] }),
    myRole: async () => ({ roleCode: 'MERLIN', visiblePlayers: [] }),
    timeline: async () => ({ missions: [], proposals: [] }),
    replay: () => { throw new Error('test games do not retain replay'); },
  });
  await page.fetchState();
  assert.equal(page.data.finished.reasonText, '刺客刺杀失败 · 梅林存活');
});
test('client missing rematch websocket recovers current lobby after old test game deletion', async () => {
  const page = pageAt({
    room: async () => { const error = new Error('old test was removed'); error.code = 'NOT_FOUND'; throw error; },
    currentRoom: async () => ({ roomId: 8, status: 'WAITING', currentGameId: null, maxPlayers: 5, players: [] }),
  });
  await page.fetchState();
  assert.equal(page.data.roomId, 8);
  assert.equal(page.data.game, null);
  assert.equal(page.data.phaseTitle, '等待大厅');
});
test('late game snapshot cannot overwrite a rematch received during an in-flight refresh', async () => {
  let resolveGame;
  const pendingGame = new Promise(resolve => { resolveGame = resolve; });
  const page = pageAt({
    room: async () => ({ roomId: 7, currentGameId: 7, maxPlayers: 5, players: [] }),
    game: () => pendingGame,
    myRole: async () => ({ roleCode: 'MERLIN', visiblePlayers: [] }),
    timeline: async () => ({ missions: [], proposals: [] }),
  });
  const refresh = page.fetchState();
  await new Promise(setImmediate);
  page.data.roomId = 8;
  resolveGame({ gameId: 7, phase: 'TEAM_BUILDING' });
  await refresh;
  assert.equal(page.data.roomId, 8);
  assert.equal(page.data.game, null);
});
test('late missing-game response from deleted test round does not kick player out of new lobby', async () => {
  let rejectGame;
  const pendingGame = new Promise((resolve, reject) => { rejectGame = reject; });
  const page = pageAt({
    room: async () => ({ roomId: 7, currentGameId: 7, maxPlayers: 5, players: [] }),
    game: () => pendingGame,
    myRole: async () => ({ roleCode: 'MERLIN', visiblePlayers: [] }),
    timeline: async () => ({ missions: [], proposals: [] }),
  });
  const refresh = page.fetchState();
  await new Promise(setImmediate);
  page.data.roomId = 8;
  const error = new Error('old game cleaned'); error.code = 'NOT_FOUND'; rejectGame(error);
  await refresh;
  assert.equal(page.data.roomId, 8);
  assert.equal(page.active, true);
});
test('host-ended human game is neutral rather than an evil win or a loss', () => {
  const history = ui.historyItem({ winner: null, finishReason: 'HOST_ENDED' });
  assert.equal(history.resultText, '房主结束');
  assert.match(history.reasonText, /不计胜负/);
  const markup = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  assert.match(markup, /房主已结束本局/);
  assert.match(markup, /wx:if="\{\{!room.testGame\}\}"[^>]*bindtap="replay"/);
  assert.match(markup, /bindtap="endGame"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../components/player-seat/player-seat.wxml'), 'utf8'), /player.isBot/);
});
test('bot and host termination services use authenticated REST endpoints', async () => {
  const calls = [];
  const box = { module: { exports: {} }, require: () => ({ request: async options => calls.push(options) }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/avalon.js'), 'utf8'), box);
  await box.module.exports.addBot(7);
  await box.module.exports.removeBot(7,3);
  await box.module.exports.endGame(7);
  assert.deepEqual(calls.map(c => [c.url, c.method]), [
    ['/api/avalon/room/7/bots', 'POST'], ['/api/avalon/room/7/bots/3', 'DELETE'], ['/api/avalon/game/7/end', 'POST'],
  ]);
});
