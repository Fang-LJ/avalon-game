const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(requiredTeamSize = 2) {
  let page;
  let snapshot = { gameId: 7, missionNo: 1, proposalNo: 1, phase: 'TEAM_BUILDING',
    requiredTeamSize, leaderPlayerId: 1, selectedPlayerIds: [] };
  const players = Array.from({ length: 10 }, (_, i) => ({ playerId: i + 1, seatNo: 10 - i,
    nickname: `玩家${i + 1}`, me: i === 0 }));
  const room = { roomId: 7, currentGameId: 7, maxPlayers: 10, myPlayerId: 1, players };
  const calls = [], toasts = [];
  const api = {
    room: async () => ({ ...room, currentGameId: snapshot.gameId }),
    game: async () => ({ ...snapshot }),
    timeline: async () => ({ missions: [], proposals: [] }),
    myRole: async () => ({ roleCode: 'LOYAL_SERVANT', visiblePlayers: [] }),
    submitTeam: async (...args) => calls.push(args),
  };
  vm.runInNewContext(read('pages/room/room.js'), {
    Page: value => { page = value; }, wx: { showToast: value => toasts.push(value) },
    clearInterval() {},
    require: name => name === '../../services/avalon' ? api
      : /services\/auth|utils\/socket/.test(name) ? {}
        : require(path.resolve(root, 'pages/room', name)),
  });
  page.data = structuredClone(page.data);
  page.setData = value => Object.assign(page.data, value);
  page.active = true;
  page.setData({ roomId: 7, room, game: snapshot, isLeader: true });
  const click = id => page.togglePlayer({ detail: { playerId: String(id) } });
  return { page, click, calls, toasts, patch: value => { snapshot = { ...snapshot, ...value }; } };
}

test('two-member selection appends, replaces only the last click, cancels, and refills', () => {
  const { page, click, calls, toasts } = fixture(2);
  for (const [id, expected] of [[1,[1]], [2,[1,2]], [3,[1,3]], [4,[1,4]], [1,[4]], [5,[4,5]]]) {
    click(id); assert.deepEqual(plain(page.data.selectedIds), expected);
  }
  assert.deepEqual(calls, []); assert.deepEqual(toasts, []);
});

for (const size of [2,3,4,5]) {
  test(`${size}-member team always replaces last chosen ID without changing earlier selections`, () => {
    const { page, click } = fixture(size);
    const chosen = [8,2,7,3,6].slice(0, size);
    chosen.forEach(click);
    const draft = page.data.selectedIds;
    const earlier = chosen.slice(0, -1);
    click(9);
    assert.deepEqual(plain(page.data.selectedIds), [...earlier,9]);
    assert.deepEqual(plain(draft), chosen, 'update must use a copy');
    click(10);
    assert.deepEqual(plain(page.data.selectedIds), [...earlier,10]);
    assert.equal(page.data.displayPlayers.filter(player => player.selected).length, size);
    assert.ok(page.data.displayPlayers.filter(player => player.selected).every(player => player.selectionClass === 'selected-team'));
    assert.deepEqual(page.data.game.selectedPlayerIds, [], 'local draft never changes server snapshot');
  });
}

test('four-member example [1,2,3,4] clicking 5 preserves first three', () => {
  const { page, click } = fixture(4);
  [1,2,3,4,5].forEach(click);
  assert.deepEqual(plain(page.data.selectedIds), [1,2,3,5]);
});

test('canceling a middle member removes exactly that ID and keeps click order', () => {
  const { page, click } = fixture(3);
  [1,2,3,2].forEach(click);
  assert.deepEqual(plain(page.data.selectedIds), [1,3]);
  click(4); click(5);
  assert.deepEqual(plain(page.data.selectedIds), [1,3,5]);
});

test('repeated full-team replacements preserve [1,2] while replacing 3 then 4 then 5', () => {
  const { page, click } = fixture(3);
  [1,2,3].forEach(click);
  for (const id of [4,5,6]) {
    click(id); assert.deepEqual(plain(page.data.selectedIds), [1,2,id]);
  }
});

test('non-leader busy result-overlay and non-selecting phases cannot edit a team', () => {
  for (const patch of [{ isLeader: false }, { busy: true }, { missionResultOpen: true },
    ...['TEAM_VOTING','MISSION_EXECUTING','ROLE_CONFIRM','FINISHED'].map(phase => ({ game: { phase } })),
    { game: null }]) {
    const { page, click } = fixture();
    page.setData({ selectedIds: [1,2], ...patch }); click(3);
    assert.deepEqual(plain(page.data.selectedIds), [1,2]);
  }
});

test('ASSASSINATION remains single-target replacement and forbids targeting self', () => {
  const { page, click } = fixture();
  page.setData({ game: { phase: 'ASSASSINATION', assassin: true } });
  click(2); assert.deepEqual(plain(page.data.selectedIds), [2]);
  click(3); assert.deepEqual(plain(page.data.selectedIds), [3]);
  click(1); assert.deepEqual(plain(page.data.selectedIds), [3]);
  assert.equal(page.data.assassinationTarget, 3);
  assert.equal(page.data.displayPlayers.find(player => player.playerId === 3).selectionClass, 'selected-assassination');
});

test('LADY_OF_LAKE remains eligible single-target replacement, not team selection', () => {
  const { page, click } = fixture();
  page.setData({ game: { phase: 'LADY_OF_LAKE', ladyHolder: true, ladyEligibleTargetIds: [2,3] } });
  click(2); assert.deepEqual(plain(page.data.selectedIds), [2]);
  click(3); assert.deepEqual(plain(page.data.selectedIds), [3]);
  click(4); assert.deepEqual(plain(page.data.selectedIds), [3]);
  assert.equal(page.data.ladyTarget, 3);
  assert.equal(page.data.displayPlayers.find(player => player.playerId === 3).selectionClass, 'selected-lady');
});

test('same-draft polling and websocket refresh retain actual selection order for the next replacement', async () => {
  const { page, click } = fixture(3);
  await page.fetchState(); [8,2,7].forEach(click);
  const key = page.data.draftKey;
  await page.refresh();
  page.handleRoomEvent({ roomId: 7, type: 'PLAYER_ONLINE' });
  await page.refreshing;
  assert.equal(page.data.draftKey, key);
  assert.deepEqual(plain(page.data.selectedIds), [8,2,7]);
  click(3);
  assert.deepEqual(plain(page.data.selectedIds), [8,2,3]);
});

for (const patch of [{ gameId: 8 }, { missionNo: 2 }, { proposalNo: 2 }, { phase: 'TEAM_VOTING' }]) {
  test(`new draft key ${JSON.stringify(patch)} clears old team click order`, async () => {
    const { page, click, patch: change } = fixture(3);
    await page.fetchState(); [8,2,7].forEach(click);
    const oldKey = page.data.draftKey; change(patch); await page.fetchState();
    assert.notEqual(page.data.draftKey, oldKey);
    assert.deepEqual(plain(page.data.selectedIds), []);
  });
}

for (const size of [2,3,4,5]) {
  test(`${size}-member submit uses existing API with exactly the ordered full draft`, async () => {
    const { page, click, calls } = fixture(size);
    page.run = task => task();
    const ids = [8,2,7,3,6].slice(0, size);
    ids.slice(0, -1).forEach(click);
    await page.submitTeam(); assert.equal(calls.length, 0);
    click(ids.at(-1)); click(9);
    await page.submitTeam();
    assert.deepEqual(plain(calls), [[7,[...ids.slice(0, -1),9]]]);
  });
}

test('team selection stays blue, assassination is amber, while done and Lady colors stay unchanged', () => {
  const css = read('components/player-seat/player-seat.wxss');
  const rule = name => css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))[1];
  assert.match(read('app.wxss'), /--selection: #55c8ff;/);
  assert.match(rule('selected-team'), /var\(--selection\)/);
  assert.doesNotMatch(rule('selected-team'), /var\(--good\)/);
  assert.match(rule('action-done-icon'), /background: var\(--good\)/);
  assert.match(rule('selected-assassination'), /#FFD166/);
  assert.match(rule('selected-lady'), /var\(--gold\)/);
  assert.match(rule('leader-icon'), /var\(--gold\)/);
});

test('resolved pending and rejected proposals share a fixed carousel and reserved mission region', () => {
  const markup = read('components/game-log/game-log.wxml'), css = read('components/game-log/game-log.wxss');
  const live = markup.split('<template name="live-proposal-record">')[1].split('</template>')[0];
  assert.match(markup, /<swiper class="history-swiper" current="\{\{historyIndex\}\}"/);
  assert.doesNotMatch(markup + css, /without-mission/);
  assert.match(css, /\.history-swiper \{ height: 312rpx/);
  assert.match(css, /\.live-proposal \{[^}]*height: 296rpx/);
  assert.match(css, /\.compact-entry \{ height: 100%/);
  assert.match(live, /<view class="proposal-mission">/);
  assert.match(css, /\.proposal-mission \{[^}]*height: 88rpx/);
  assert.match(live, /wx:elif="\{\{item.status === 'APPROVED'\}\}"[^>]*>任务进行中/);
  assert.match(live, /wx:else[^>]*>未执行任务/);
  assert.match(live, /任务\{\{item.mission.status === 'SUCCESS' \? '成功' : '失败'\}\}/);
});

test('live proposal labels use fixed width and values align independently from long leader nicknames', () => {
  const css = read('components/game-log/game-log.wxss');
  const live = read('components/game-log/game-log.wxml').split('<template name="live-proposal-record">')[1].split('</template>')[0];
  for (const label of ['队长','队伍','同意','反对'])
    assert.ok(live.includes(`class="proposal-label">${label}</text>`));
  assert.equal((live.match(/class="proposal-info-grid"/g) || []).length, 1);
  assert.doesNotMatch(live, /proposal-field|proposal-team|proposal-votes|proposal-columns/);
  assert.equal((live.match(/class="proposal-value/g) || []).length, 4);
  assert.match(css, /grid-template-columns: 54rpx minmax\(0, 1fr\) 54rpx minmax\(0, 1.25fr\)/);
  assert.match(css, /\.proposal-value \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap/);
  assert.match(css, /\.live-proposal \.log-title \{[^}]*font-size: 26rpx/);
  assert.match(css, /\.proposal-info-grid \{[^}]*font-size: 24rpx/);
  assert.match(css, /\.proposal-status \{[^}]*font-size: 20rpx[^}]*white-space: nowrap/);
  assert.doesNotMatch(live, /队长：|队伍：|同意：|反对：|SUCCESS ×|FAIL ×/);
});
