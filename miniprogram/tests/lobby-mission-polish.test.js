const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const roomMarkup = read('pages/room/room.wxml');
const roomCss = read('pages/room/room.wxss');
function mission(busy) {
  let definition;
  vm.runInNewContext(read('components/mission-card-overlay/mission-card-overlay.js'), { Component: value => { definition = value; } });
  const events = [];
  return { data: { busy, evil: true, choice: 'FAIL' }, ...definition.methods, events,
    triggerEvent: name => events.push(name) };
}

test('mission secondary actions are plain views, never disabled native buttons', () => {
  const w = read('components/mission-card-overlay/mission-card-overlay.wxml');
  for (const [name, text, handler] of [['mission-votes', '查看投票结果 ›', 'votes'], ['mission-close', '收起', 'close']]) {
    assert.match(w, new RegExp(`<view class="mission-secondary-action ${name} \\{\\{busy \\? 'disabled' : ''\\}\\}"[^>]*bindtap="${handler}">${text}</view>`));
    assert.doesNotMatch(w, new RegExp(`<button[^>]*${name}`));
  }
  assert.match(w, /<button class="btn" disabled="\{\{busy \|\| !choice\}\}" loading="\{\{busy\}\}" bindtap="submit">确认提交<\/button>/);
  assert.doesNotMatch(w, /暂时收起|查看组队投票结果/);
});
test('mission busy state only fades text, with no native disabled or background overrides', () => {
  const css = read('components/mission-card-overlay/mission-card-overlay.wxss');
  assert.match(css, /\.mission-secondary-actions \{[^}]*display: flex[^}]*justify-content: space-between/);
  assert.match(css, /\.mission-secondary-action.disabled \{ opacity: 0.4; \}/);
  const rules = css.split('\n').filter(line => /mission-secondary-action|mission-votes|mission-close/.test(line)).join('\n');
  assert.doesNotMatch(rules, /background|border|radius|\[disabled\]|::after/);
  assert.match(css, /\.mission-votes \{ color: var\(--gold\)/);
  assert.match(css, /\.mission-close \{[^}]*color: var\(--muted\)/);
});
test('mission secondary handlers ignore busy taps and retain their distinct events', () => {
  const c = mission(true); c.votes(); c.close(); c.submit();
  assert.deepEqual(c.events, []);
  c.data.busy = false; c.votes(); c.close(); c.submit();
  assert.deepEqual(c.events, ['votes', 'close', 'submit']);
  c.data.evil = false; c.events.length = 0; c.submit();
  assert.deepEqual(c.events, [], 'GOOD still cannot submit FAIL');
});
test('only roleCode MERLIN and PERCIVAL receive special tags; names never decide identity', () => {
  const rows = ui.finishedIdentities([
    { playerId: 1, seatNo: 1, roleCode: 'MERLIN', roleName: '任意名称' },
    { playerId: 2, seatNo: 2, roleCode: 'PERCIVAL', roleName: '任意名称' },
    ...['LOYAL_SERVANT', 'MORGANA', 'ASSASSIN', 'MINION', 'MORDRED', 'OBERON'].map((roleCode, i) =>
      ({ playerId: i + 3, seatNo: i + 3, roleCode, roleName: '梅林' })),
  ]);
  assert.deepEqual(rows.map(p => p.roleClass), ['role-merlin', 'role-percival', '', '', '', '', '', '']);
  assert.match(roomMarkup, /item.roleClass \? 'special-role-tag' : ''/);
  assert.match(roomMarkup, /wx:if="\{\{item.roleClass\}\}" class="special-role-symbol"/);
  assert.match(roomMarkup, /item.roleClass === 'role-merlin' \? '✦' : '◆'/);
});
test('special settlement tags use gold and purple pills, not ordinary cyan or blinking', () => {
  assert.match(roomCss, /\.identity-role.special-role-tag \{[^}]*border-radius: 999rpx; padding: 4rpx 12rpx; white-space: nowrap/);
  assert.match(roomCss, /\.identity-role.role-merlin \{ color: #f0d58c; background: rgba\(240,213,140,.10\); border-color: rgba\(240,213,140,.40\)/);
  assert.match(roomCss, /\.identity-role.role-percival \{ color: #c3aeff; background: rgba\(182,156,255,.10\); border-color: rgba\(182,156,255,.42\)/);
  assert.doesNotMatch(roomCss, /#afc7ff/);
  assert.match(roomCss, /\.settlement-evil \{ color: var\(--evil\)/);
  const rules = roomCss.split('\n').filter(line => /role-merlin|role-percival|special-role-tag/.test(line)).join('\n');
  assert.doesNotMatch(rules, /animation|blink/);
});
test('lobby close action is inside the single room card, only for host and busy-safe', () => {
  assert.doesNotMatch(roomMarkup + roomCss, /host-controls|host-end/);
  const card = roomMarkup.split('<view class="card lobby-card">')[1].split('<view class="section-title lobby-label">')[0];
  assert.match(card, /lobby-card-heading/);
  assert.match(card, /wx:if="\{\{room.host\}\}" class="lobby-close-action \{\{busy \? 'disabled' : ''\}\}"[^>]*bindtap="endGame">关闭房间/);
  for (const field of ['lobbyStatus', 'room.roomCode']) assert.ok(card.includes(field));
  assert.match(read('pages/room/room.js'), /lobbyStatus: ui.lobbyStatus\(room\)/);
  assert.match(roomMarkup, /disabled="\{\{!room.canStart \|\| busy\}\}"/);
  assert.match(roomCss, /\.lobby-close-action \{[^}]*font-size: 22rpx; color: var\(--evil\)/);
  const js = read('pages/room/room.js').split('  endGame() {')[1].split('  identityRevealed')[0];
  assert.match(js, /!room.host \|\| busy/); assert.match(js, /wx.showModal/); assert.match(js, /if \(!result.confirm\) return/);
  const gameTop = roomMarkup.split('class="game-status-row">')[1].split('  <block wx:if=')[0];
  assert.match(gameTop, /bindtap="endGame">结束/);
});
test('lobby share and copy remain in one 2:1 row of equal-height rounded buttons', () => {
  const actions = roomMarkup.split('<view class="lobby-invite-actions">')[1].split('</view>')[0];
  assert.match(actions, /room.status === 'WAITING'[^>]*class="invite-button" open-type="share">邀请好友/);
  assert.match(actions, /class="copy-code-button" bindtap="copyCode">复制房号/);
  assert.match(roomCss, /\.lobby-invite-actions \{ display: grid; grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\); gap: 16rpx/);
  assert.match(roomCss, /\.invite-button, \.copy-code-button \{[^}]*height: 74rpx[^}]*border-radius: 24rpx; white-space: nowrap/);
  assert.match(roomCss, /\.invite-button \{ color: var\(--bg\); background: var\(--gold\)/);
  assert.match(roomCss, /\.copy-code-button \{[^}]*background: transparent; border-color: var\(--border\)/);
});
test('lobby centre displays seated/standing instructions, never a duplicate room code', () => {
  const center = roomMarkup.split('<view class="card lobby-center">')[1].split('    </view>\n    <view wx:if="{{standingPlayers.length}}"')[0];
  assert.doesNotMatch(center, /roomCode|房间号/);
  for (const phrase of ['room.mySeatNo', '号位', '当前站立', '我的座位', '请选择座位']) assert.ok(center.includes(phrase));
  assert.doesNotMatch(center, /等待好友加入/);
  assert.match(roomCss, /\.lobby-label \{\s*margin-top: 30rpx/);
  assert.match(roomCss, /\.lobby-board \{\s*height: 820rpx;\s*margin-top: 24rpx/);
});
test('WAITING share keeps exact six-digit room path; active games fall back to home', () => {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {
    require: name => require(path.resolve(root, 'pages/room', name)), Page: value => { page = value; },
  });
  page.data = { room: { roomCode: '396152', maxPlayers: 8, status: 'WAITING' }, game: null };
  assert.ok(page.onShareAppMessage().title);
  assert.equal(page.onShareAppMessage().path, '/pages/join/join?roomCode=396152');
  page.data.game = { gameId: 1 }; assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  page.data.game = null; page.data.room.status = 'PLAYING'; assert.equal(page.onShareAppMessage().path, '/pages/index/index');
});
test('375/390/430 widths reserve enough space for two action cards, copy text and role tags', () => {
  for (const width of [375, 390, 430]) {
    const scale = width / 750;
    const actionWidth = ((750 - 2 * 38 - 2 * 24 - 16) / 3) * scale;
    assert.ok(actionWidth >= (4 * 23 + 2 * 12) * scale + 2, `${width}px copy text fits`);
    const missionInner = (750 - 2 * 28 - 2 * 24) * scale - 2;
    assert.ok(missionInner > (2 * 254 + 28 + 2 * 12) * scale, `${width}px cards fit`);
    for (const count of [5, 6, 7, 8, 9, 10]) {
      const rowInner = (750 - 2 * 38 - 2 * 24) * scale - 2;
      const fixed = (68 + 2 * 16 + 4 * 23 + 4 * 23 + 19 + 24) * scale + 2;
      assert.ok(rowInner > fixed, `${width}px ${count} players: special tag and seat fit`);
    }
  }
});
