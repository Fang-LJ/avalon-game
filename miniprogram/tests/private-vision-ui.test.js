const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const views = [
  'components/card-deal-stage/card-deal-stage.wxml',
  'pages/room/room.wxml',
  'pages/demo-room/demo-room.wxml',
];
function label(file, item) {
  const match = read(file).match(/<text wx:if="\{\{item.markType\}\}" class="vision-label (\{\{.*?\}\})">\{\{(.*?)\}\}<\/text>/);
  assert.ok(match, file + ' renders the private vision label');
  if (!item.markType) return null;
  return {
    text: vm.runInNewContext(match[2], { item }),
    tone: vm.runInNewContext(match[1].slice(2, -2), { item }),
  };
}
for (const file of views) {
  test(file + ' shows the authorized full evil teammate identity after seat and nickname', () => {
    for (const code of ['ASSASSIN', 'MORGANA', 'MINION', 'MORDRED']) {
      const item = ui.privateVisiblePlayer({ playerId: 2, seatNo: 2, nickname: 'Arrebol', knowledgeType: 'EVIL_ALLY', roleCode: code }, 'MORGANA');
      assert.deepEqual(label(file, item), { text: ui.ROLE_NAMES[code], tone: 'vision-label-evil' });
      assert.equal(item.nickname, 'Arrebol');
    }
    const markup = read(file);
    assert.match(markup, /class="vision-seat">\{\{item.seatNo\}\}号<\/text>\s*<text class="vision-nickname">\{\{item.nickname\}\}<\/text>\s*<text[^>]*class="vision-label /);
    assert.doesNotMatch(markup, /item.roleCode/);
  });
  test(file + ' never labels Merlin vision with an exact evil role', () => {
    for (const roleCode of ['ASSASSIN', 'MORGANA', 'MINION', 'OBERON']) {
      const item = ui.privateVisiblePlayer({ playerId: 4, seatNo: 4, nickname: '小王', knowledgeType: 'EVIL', roleCode, roleName: ui.ROLE_NAMES[roleCode] }, 'MERLIN');
      assert.deepEqual(label(file, item), { text: '红方', tone: 'vision-label-evil' });
      assert.equal(item.nickname, '小王');
      assert.equal('roleCode' in item, false);
      assert.equal('roleName' in item, false);
    }
  });
  test(file + ' renders identical purple candidate labels without exposing either identity', () => {
    for (const roleCode of ['MERLIN', 'MORGANA']) {
      const item = ui.privateVisiblePlayer({ playerId: 5, seatNo: 5, nickname: '真实昵称'.repeat(40), knowledgeType: 'MERLIN_OR_MORGANA', roleCode, roleName: ui.ROLE_NAMES[roleCode] }, 'PERCIVAL');
      assert.deepEqual(label(file, item), { text: '?', tone: 'vision-label-candidate' });
      assert.equal(item.nickname, '真实昵称'.repeat(40));
      assert.equal('roleCode' in item, false);
      assert.equal('roleName' in item, false);
    }
    for (const viewer of ['LOYAL_SERVANT', 'OBERON']) {
      const item = ui.privateVisiblePlayer({ knowledgeType: 'EVIL_ALLY', roleCode: 'ASSASSIN' }, viewer);
      assert.equal(label(file, item), null);
    }
  });
}
for (const file of ['components/card-deal-stage/card-deal-stage.wxss', 'pages/room/room.wxss']) {
  test(file + ' truncates only long nicknames while preserving seats and full labels', () => {
    const css = read(file);
    assert.match(css, /\.vision-seat, \.vision-label \{ flex-shrink: 0; white-space: nowrap; \}/);
    assert.match(css, /\.vision-nickname \{ flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; \}/);
    assert.match(css, /\.vision-label \{[^}]*border-radius: 12rpx; color: #FFFFFF;[^}]*\}/);
    assert.match(css, /\.vision-label-evil \{ background: #A93447; \}/);
    assert.match(css, /\.vision-label-candidate \{ background: #8052C1; \}/);
  });
}
test('revealed vision gives every player a full-width row with the label at its right edge', () => {
  const css = read('components/card-deal-stage/card-deal-stage.wxss');
  assert.match(css, /\.vision-chips \{ display: flex; flex-direction: column; gap: 16rpx; margin-top: 14rpx; \}/);
  assert.match(css, /\.vision-chip \{[^}]*width: 100%;[^}]*\}/);
});
