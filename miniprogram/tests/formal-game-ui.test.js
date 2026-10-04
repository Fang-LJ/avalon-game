const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function pageAt(api = {}, wx = {}) {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {
    require: name => name === '../../services/avalon' ? api
      : name === '../../services/auth' || name === '../../utils/socket' ? {}
        : require(path.resolve(root, 'pages/room', name)),
    Page: value => { page = value; }, wx, clearInterval() {},
  });
  page.data = structuredClone(page.data);
  page.setData = values => Object.assign(page.data, values);
  page.active = true;
  return page;
}

function missionFixture(patch = {}, apiPatch = {}, wx = {}) {
  let snapshot = {
    gameId: 7, missionNo: 2, proposalNo: 1, phase: 'MISSION_EXECUTING',
    onMission: true, evil: true, hasSubmittedMission: false,
    requiredTeamSize: 3, leaderPlayerId: 1, selectedPlayerIds: [1, 2, 3], ...patch,
  };
  const room = {
    roomId: 7, currentGameId: 7, maxPlayers: 6, host: true,
    myPlayerId: 1, players: [1, 2, 3, 4, 5, 6].map(seatNo => ({
      playerId: seatNo, seatNo, nickname: `玩家${seatNo}`, me: seatNo === 1,
    })),
  };
  const calls = [];
  const page = pageAt({
    room: async () => ({ ...room, currentGameId: snapshot.gameId }),
    game: async () => ({ ...snapshot }),
    timeline: async () => ({ missions: [], proposals: [] }),
    myRole: async () => ({ roleCode: 'ASSASSIN', visiblePlayers: [] }),
    mission: async (...args) => { calls.push(args); snapshot.hasSubmittedMission = true; },
    ...apiPatch,
  }, wx);
  page.data.roomId = 7;
  return { page, calls, set: patch => { snapshot = { ...snapshot, ...patch }; }, room };
}

function overlayAt(patch = {}) {
  let definition;
  vm.runInNewContext(read('components/mission-card-overlay/mission-card-overlay.js'), {
    Component: value => { definition = value; },
  });
  const events = [];
  const instance = {
    data: { evil: true, busy: false, choice: '', ...patch },
    ...definition.methods,
    triggerEvent: event => events.push(event),
  };
  return { instance, events };
}

test('mission track renders five status dots without duplicated GOOD/EVIL scores', () => {
  const markup = read('components/mission-track/mission-track.wxml');
  assert.doesNotMatch(markup, /score|正义|邪恶|\{\{good\}\}|\{\{evil\}\}/);
  let definition;
  vm.runInNewContext(read('components/mission-track/mission-track.js'), { Component: value => { definition = value; } });
  let data;
  definition.observers['missions,current'].call({ setData: value => { data = value; } },
    [{ missionNo: 1, status: 'SUCCESS' }, { missionNo: 2, status: 'FAILED' }], 3);
  assert.equal(JSON.stringify(data.dots.map(dot => dot.label)), JSON.stringify(['✓', '×', 3, '•', '•']));
});

for (const [phase, className, color] of [
  ['TEAM_BUILDING', 'selected-team', 'good'], ['ASSASSINATION', 'selected-danger', 'evil'],
  ['LADY_OF_LAKE', 'selected-lady', 'gold'],
]) {
  test(`${phase} selects an avatar ring using ${color} without a tick badge`, () => {
    const player = ui.seats([{ playerId: 1, seatNo: 1, nickname: '我', me: true,
      knowledgeType: 'EVIL_ALLY' }], [1], 1, 6, phase)[0];
    assert.equal(player.selectionClass, className);
    assert.equal(player.selected, true);
    assert.equal(player.leader, true);
    assert.equal(player.knowledgeSymbol, '●');
    assert.equal(player.me, true);
    assert.match(read('components/player-seat/player-seat.wxss'),
      new RegExp(`\\.${className} \\{ box-shadow:[^}]*var\\(--${color}\\)`));
    const markup = read('components/player-seat/player-seat.wxml');
    assert.match(markup, /player\.selected \? player\.selectionClass/);
    assert.doesNotMatch(markup, /selected-icon|>✓</);
    ['leader-icon', 'knowledge-icon', 'me-icon'].forEach(name => assert.match(markup, new RegExp(name)));
  });
}

test('selection phase is merged only into local display players, never public room players', () => {
  const page = pageAt();
  const player = { playerId: 2, seatNo: 2, nickname: '乙' };
  page.setData({ room: { players: [player], maxPlayers: 6 },
    game: { phase: 'ASSASSINATION', leaderPlayerId: 2 }, selectedIds: [2] });
  page.decoratePlayers();
  assert.equal(page.data.displayPlayers[0].selectionClass, 'selected-danger');
  assert.equal(player.selectionClass, undefined);
  assert.equal(player.knowledgeType, undefined);
});

test('mission artworks live only in the private overlay and main footer opens it', () => {
  const markup = read('pages/room/room.wxml');
  assert.doesNotMatch(markup, /class="mission-info|class="mission-select|class="mission-cards|class="privacy-note/);
  assert.match(markup, /<mission-card-overlay/);
  assert.match(markup, /bind:submit="submitMission"/);
  const actions = markup.split('<view class="phase-actions actions">')[1].split('</block>')[0];
  assert.doesNotMatch(actions, /bindtap="submitMission"|确认提交/);
  assert.match(actions, /bindtap="openMissionOverlay"/);
  assert.match(actions, /已秘密提交/);
  assert.match(read('components/mission-card-overlay/mission-card-overlay.wxss'), /position: fixed/);
});

test('eligible mission member automatically opens overlay once per round', async () => {
  const { page } = missionFixture();
  await page.fetchState();
  assert.equal(page.data.missionOverlayOpen, true);
  assert.equal(page.data.missionOverlayKey, '7-2-1');
  page.closeMissionOverlay();
  await page.fetchState();
  await page.fetchState();
  assert.equal(page.data.missionOverlayOpen, false);
  page.openMissionOverlay();
  assert.equal(page.data.missionOverlayOpen, true);
});

test('non-members already-submitted players and other phases never open mission overlay', async () => {
  for (const patch of [{ onMission: false }, { hasSubmittedMission: true }, { phase: 'TEAM_BUILDING' }]) {
    const { page } = missionFixture(patch);
    await page.fetchState();
    page.openMissionOverlay();
    assert.equal(page.data.missionOverlayOpen, false);
  }
});

test('GOOD overlay shows SUCCESS only, EVIL shows both; component only emits UI events', () => {
  const markup = read('components/mission-card-overlay/mission-card-overlay.wxml');
  assert.match(markup, /front="\{\{successCard\}\}"/);
  assert.match(markup, /wx:if="\{\{evil\}\}"[^>]*mission-card-option/);
  assert.match(markup, /front="\{\{failCard\}\}"/);
  assert.doesNotMatch(read('components/mission-card-overlay/mission-card-overlay.js'), /services|request\(|api\./);
  const { instance, events } = overlayAt({ evil: false });
  instance.chooseFail();
  instance.chooseSuccess();
  assert.deepEqual(events, ['success']);
});

test('no selected card means no submit; selection emits without implicitly submitting', () => {
  const { instance, events } = overlayAt();
  instance.submit();
  assert.equal(events.length, 0);
  instance.chooseFail();
  assert.deepEqual(events, ['fail']);
  instance.data.choice = 'FAIL';
  instance.submit();
  assert.deepEqual(events, ['fail', 'submit']);
  instance.data.busy = true;
  instance.submit();
  instance.chooseSuccess();
  instance.close();
  instance.votes();
  assert.equal(events.length, 2);
});

test('closing or viewing votes preserves selected card and never submits', async () => {
  const { page, calls } = missionFixture();
  await page.fetchState();
  page.missionFail();
  page.closeMissionOverlay();
  assert.equal(page.data.missionChoice, 'FAIL');
  assert.equal(page.data.missionOverlayOpen, false);
  assert.equal(calls.length, 0);
  page.openMissionOverlay();
  page.toggleVotes();
  assert.equal(page.data.missionOverlayOpen, false);
  assert.equal(page.data.viewVotes, true);
  await page.fetchState();
  assert.equal(page.data.missionOverlayOpen, false);
  page.toggleVotes();
  assert.equal(page.data.missionOverlayOpen, true);
  assert.equal(page.data.viewVotes, false);
  assert.equal(page.data.missionChoice, 'FAIL');
  assert.equal(calls.length, 0);
});

test('same-round websocket refresh retains chosen FAIL and open overlay', async () => {
  const { page } = missionFixture();
  await page.fetchState();
  page.missionFail();
  await page.handleRoomEvent({ roomId: 7, type: 'MISSION_SUBMITTED' });
  await page.refreshing;
  assert.equal(page.data.missionChoice, 'FAIL');
  assert.equal(page.data.missionOverlayOpen, true);
  assert.equal(page.data.missionOverlayKey, '7-2-1');
});

for (const patch of [{ gameId: 8 }, { missionNo: 3 }, { proposalNo: 2 }]) {
  test(`new task ${JSON.stringify(patch)} clears previous choice and automatically opens a fresh overlay`, async () => {
    const { page, set } = missionFixture();
    await page.fetchState();
    page.missionFail();
    page.closeMissionOverlay();
    set(patch);
    await page.fetchState();
    assert.equal(page.data.missionChoice, '');
    assert.equal(page.data.missionOverlayOpen, true);
    assert.notEqual(page.data.missionOverlayKey, '7-2-1');
  });
}

test('leaving mission phase closes old overlay and clears private choice', async () => {
  const { page, set } = missionFixture();
  await page.fetchState();
  page.missionFail();
  set({ phase: 'TEAM_BUILDING', missionNo: 3 });
  await page.fetchState();
  assert.equal(page.data.missionChoice, '');
  assert.equal(page.data.missionOverlayOpen, false);
  assert.equal(page.data.missionOverlayKey, '');
});

test('only successful explicit submit closes overlay; polling does not reopen it', async () => {
  const { page, calls } = missionFixture();
  await page.fetchState();
  await page.submitMission();
  assert.equal(calls.length, 0);
  page.missionFail();
  await page.submitMission();
  assert.deepEqual(calls, [[7, 'FAIL']]);
  assert.equal(page.data.missionOverlayOpen, false);
  assert.equal(page.data.missionChoice, '');
  await page.fetchState();
  assert.equal(page.data.missionOverlayOpen, false);
});

test('failed mission request retains choice and open overlay for retry', async () => {
  const { page } = missionFixture({}, { mission: async () => { throw new Error('network failure'); } });
  await page.fetchState();
  page.missionFail();
  await page.submitMission();
  assert.equal(page.data.missionOverlayOpen, true);
  assert.equal(page.data.missionChoice, 'FAIL');
  assert.equal(page.data.busy, false);
});

test('duplicate confirm clicks while request is pending issue only one API call', async () => {
  let resolve;
  let calls = 0;
  const pending = new Promise(done => { resolve = done; });
  const { page } = missionFixture({}, { mission: () => { calls++; return pending; } });
  await page.fetchState();
  page.missionSuccess();
  const first = page.submitMission();
  await new Promise(setImmediate);
  await page.submitMission();
  page.closeMissionOverlay();
  assert.equal(page.data.missionOverlayOpen, true);
  resolve();
  await first;
  assert.equal(calls, 1);
  assert.equal(page.data.missionOverlayOpen, false);
});

test('old request success cannot close the next round overlay or clear its new selection', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { page, set } = missionFixture({}, { mission: () => pending });
  await page.fetchState();
  page.missionFail();
  const submission = page.submitMission();
  await new Promise(setImmediate);
  set({ missionNo: 3 });
  await page.fetchState();
  // Model a new task's local selection without bypassing the old submit's busy lock.
  page.setData({ missionChoice: 'SUCCESS' });
  resolve();
  await submission;
  assert.equal(page.data.missionChoice, 'SUCCESS');
  assert.equal(page.data.missionOverlayOpen, true);
});

test('my identity and mission overlays are mutually exclusive', async () => {
  const { page } = missionFixture();
  await page.fetchState();
  page.openRoleOverlay();
  assert.equal(page.data.roleOverlay, true);
  assert.equal(page.data.missionOverlayOpen, false);
  page.openMissionOverlay();
  assert.equal(page.data.roleOverlay, false);
  assert.equal(page.data.missionOverlayOpen, true);
});

test('compact top row keeps task progress identity exit and host end together', () => {
  const markup = read('pages/room/room.wxml');
  assert.match(markup, /room.host && !game[^>]*class="host-controls"/);
  const row = markup.split('class="game-status-row">')[1].split('  <block wx:if=')[0];
  ['mission-track', 'openRoleOverlay', 'confirmLeaveRoom', 'endGame'].forEach(name => assert.match(row, new RegExp(name)));
  assert.match(row, /wx:if="\{\{room.host\}\}"/);
  const css = read('pages/room/room.wxss');
  const trigger = css.match(/\.private-role-trigger \{([^}]+)\}/)[1];
  assert.doesNotMatch(trigger, /fixed|top:|right:/);
  assert.match(css, /\.board \{\s*height: 720rpx;\s*margin-top: 14rpx/);
  assert.match(css, /\.board\.large-table \{\s*height: 900rpx/);
  assert.doesNotMatch(css, /height: 820rpx[^]*\.room-page \.board/);
});

test('ordinary player exits only after confirmation; cancellation does not call API', async () => {
  let dialog;
  let calls = 0;
  const { page, room } = missionFixture({}, { leaveRoom: async () => { calls++; } }, {
    showModal: options => { dialog = options; }, reLaunch() {},
  });
  room.host = false;
  await page.fetchState();
  page.confirmLeaveRoom();
  assert.equal(dialog.title, '退出当前房间？');
  assert.match(dialog.content, /暂时离线/);
  assert.equal(calls, 0);
  dialog.success({ confirm: false });
  assert.equal(calls, 0);
  dialog.success({ confirm: true });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
});

test('stale exit dialog cannot leave a rematch lobby', async () => {
  let dialog;
  const { page } = missionFixture({}, {}, { showModal: options => { dialog = options; } });
  await page.fetchState();
  let calls = 0;
  page.leaveRoom = () => { calls++; };
  page.confirmLeaveRoom();
  page.data.roomId = 8;
  dialog.success({ confirm: true });
  assert.equal(calls, 0);
});

test('375/390/430px mission overlay fits two cards plus selection glow and keeps safe-area footer', () => {
  const cardCss = read('components/play-card/play-card.wxss');
  const css = read('components/mission-card-overlay/mission-card-overlay.wxss');
  const widthRpx = Number(cardCss.match(/\.size-action \{ width: (\d+)rpx/)[1]);
  for (const width of [375, 390, 430]) {
    const scale = width / 750;
    const inner = width - (28 * 2 + 24 * 2) * scale - 2;
    const cards = (2 * widthRpx + 28 + 24) * scale;
    assert.ok(cards <= inner, `${width}px: mission cards overflow`);
    const track = (5 * 48 + 5 * 8 + 42) * scale;
    const actions = (2 * 72 + 100 + 8 + 12) * scale;
    assert.ok(track + actions <= 674 * scale, `${width}px: status row overflow`);
  }
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /scroll-y|mission-content/);
  assert.match(css, /translateY\(-10rpx\)/);
  assert.match(css, /choice-muted/);
});

test('page reserves more scrollable bottom space than the fixed footer including safe area', () => {
  const css = read('pages/room/room.wxss');
  assert.match(css, /\.has-phase-actions \{\s*padding-bottom: calc\(220rpx \+ env\(safe-area-inset-bottom\)\)/);
  // The long-nickname footer can wrap its note to two lines.
  const footer = 18 + 92 + 12 + 64 + 14;
  assert.ok(220 > footer);
  assert.match(css, /\.room-page \.phase-actions \{[^}]*position: fixed/);
  assert.match(read('pages/room/room.wxml'), /<game-log[^>]*compact="\{\{true\}\}"/);
});
