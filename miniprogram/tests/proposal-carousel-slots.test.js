const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const { CARDS } = require('../utils/cards');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('components/game-log/game-log.wxml');
const css = read('components/game-log/game-log.wxss');
const rule = selector => css.split(`${selector} {`)[1].split('}')[0];
const plain = value => JSON.parse(JSON.stringify(value));
function component() {
  let definition;
  vm.runInNewContext(read('components/game-log/game-log.js'), {
    Component: value => { definition = value; },
    require: name => require(path.resolve(root, 'components/game-log', name)),
  });
  const c = { data: structuredClone(definition.data), ...definition.methods };
  c.setData = value => Object.assign(c.data, value);
  c.refresh = (entries, slots = 4, gameId = 1, compact = true, replay = false) =>
    definition.observers['entries,gameId,compact,replay,maxMissionSlots'].call(c, entries, gameId, compact, replay, slots);
  return c;
}
const entry = (id = 1, success = 2, fail = 1) => ({
  proposalId: id, status: 'APPROVED',
  mission: { missionNo: 2, status: 'FAILED', successCount: success, failCount: fail },
});

for (const [count, slots] of [[5,3],[6,4],[7,4],[8,5],[9,5],[10,5]]) {
  test(`${count}-player room reuses the existing rules maximum for ${slots} fixed slots`, () => {
    assert.equal(ui.rules(count).maxMissionSlots, slots);
    assert.equal(Math.max(...ui.rules(count).teamText.split(' / ').map(Number)), slots);
    const c = component(); c.refresh([entry(1,2,0)], ui.rules(count).maxMissionSlots);
    assert.equal(c.data.liveEntries[0].missionSlots.length, slots);
    assert.equal(c.data.liveEntries[0].missionSlotCount, slots);
    assert.deepEqual(plain(c.data.liveEntries[0].missionSlotIndexes), Array.from({ length: slots }, (_, index) => index));
    assert.deepEqual(plain(c.data.liveEntries[0].missionSlots.slice(2)), Array(slots - 2).fill(null));
  });
}
test('room binds the calculated rule maximum, component never duplicates the Avalon team table', () => {
  assert.match(read('pages/room/room.wxml'), /maxMissionSlots="\{\{rule.maxMissionSlots\}\}"/);
  assert.match(read('pages/room/room.js'), /rule: ui.rules\(room.maxPlayers\)/);
  assert.doesNotMatch(read('components/game-log/game-log.js'), /TEAMS|teamText|rules\(|\[2,\s*3,\s*2/);
});
test('seven-player results are success success fail null, independent of the actual team size', () => {
  const c = component(), input = entry(); c.refresh([input], 4);
  assert.deepEqual(plain(c.data.liveEntries[0].missionSlots.map(card => card?.src || null)),
    [CARDS.actions.SUCCESS, CARDS.actions.SUCCESS, CARDS.actions.FAIL, null]);
  assert.deepEqual(plain(c.data.allEntries[0].missionSlots), plain(c.data.liveEntries[0].missionSlots));
  assert.equal(input.missionSlots, undefined, 'never mutate incoming proposal data');
  c.refresh([entry(1,3,1)], 4);
  assert.equal(c.data.liveEntries[0].missionSlots.length, 4);
});
test('ten-player result fills five slots, success before failure with no player identity', () => {
  const c = component(); c.refresh([entry(1,3,2)], 5);
  const cards = c.data.liveEntries[0].missionSlots;
  assert.deepEqual(plain(cards.map(card => card.src)),
    [CARDS.actions.SUCCESS, CARDS.actions.SUCCESS, CARDS.actions.SUCCESS, CARDS.actions.FAIL, CARDS.actions.FAIL]);
  assert.ok(cards.every(card => Object.keys(card).join(',') === 'index,src'));
});
test('rejected pending and malformed results keep the same empty slots without leaking actions', () => {
  const c = component();
  for (const input of [
    { ...entry(), status: 'REJECTED' },
    { ...entry(), mission: null },
    { ...entry(), mission: { ...entry().mission, status: 'EXECUTING' } },
    entry(1,99,1),
  ]) {
    c.refresh([input], 4);
    assert.deepEqual(plain(c.data.liveEntries[0].missionSlots), [null,null,null,null]);
    assert.equal(c.data.liveEntries[0].missionCards.length, 0);
  }
});
test('slot count property updates preserve current proposal and open all-history state', () => {
  const c = component(), entries = [entry(1),entry(2),entry(3)];
  c.refresh(entries, 4); c.historyChange({ detail: { current: 0 } });
  c.data.compact = true; c.openAllHistory();
  c.refresh(entries, 5);
  assert.equal(c.data.currentProposalId, 1); assert.equal(c.data.historyIndex, 0);
  assert.equal(c.data.allHistoryOpen, true);
  assert.ok(c.data.liveEntries.every(item => item.missionSlots.length === 5));
  for (const invalid of [0,2,6,null]) {
    c.refresh(entries, invalid); assert.equal(c.data.liveEntries[0].missionSlots.length, 5);
  }
});
test('empty slots occupy equal grid cells but never render placeholder images or decoration', () => {
  assert.match(markup, /class="mission-slots slots-\{\{item.missionSlotCount\}\}"/);
  assert.match(markup, /wx:for="\{\{item.missionSlotIndexes\}\}"[^>]*wx:key="\*this"[^>]*class="mission-slot \{\{item.missionSlots\[slotIndex\] \? '' : 'empty'\}\}"/);
  assert.match(markup, /<image wx:if="\{\{item.missionSlots\[slotIndex\]\}\}" src="\{\{item.missionSlots\[slotIndex\].src\}\}"/);
  assert.doesNotMatch(css, /\.empty\s*\{|\.mission-slot[^}]*\{[^}]*\b(?:border|background):/);
  for (const count of [3,4,5]) assert.match(rule(`.slots-${count}`), new RegExp(`repeat\\(${count}, 1fr\\)`));
  assert.match(rule('.mission-slot'), /align-items: center; justify-content: center/);
  assert.match(rule('.mission-result-label'), /width: 116rpx; flex-shrink: 0/);
});
test('status badges have restrained color background border and smaller text than the heading', () => {
  assert.match(markup, /proposal-status \{\{item.status === 'APPROVED' \? 'approved' : 'rejected'\}\}/);
  assert.match(rule('.proposal-status'), /font-size: 20rpx/);
  assert.match(rule('.proposal-status'), /padding: 4rpx 12rpx; border: 1px solid; border-radius: 999rpx/);
  for (const [status,color] of [['approved','good'],['rejected','evil']]) {
    assert.match(rule(`.proposal-status.${status}`), new RegExp(`color: var\\(--${color}\\)`));
    assert.match(rule(`.proposal-status.${status}`), /background: rgba\(/);
    assert.match(rule(`.proposal-status.${status}`), /border-color: rgba\(/);
  }
});
test('noncircular carousel separates wrapper from shared card with previews and real padding', () => {
  const carousel = markup.split('<swiper class="history-swiper"')[1].split('</swiper>')[0];
  assert.match(carousel, /previous-margin="28rpx" next-margin="28rpx"/);
  assert.match(carousel, /circular="\{\{false\}\}"/);
  assert.match(carousel, /<swiper-item[^>]*>\s*<view class="proposal-slide \{\{historyIndex === index \? 'active' : 'inactive'\}\}">/);
  assert.match(rule('.proposal-slide'), /height: 100%; box-sizing: border-box; padding: 8rpx 6rpx/);
  assert.match(rule('.proposal-slide'), /transform: scale\(\.97\); opacity: \.78/);
  assert.match(rule('.proposal-slide.active'), /transform: scale\(1\); opacity: 1/);
  assert.match(rule('.proposal-slide'), /transition: transform 250ms ease, opacity 250ms ease/);
  assert.match(rule('.proposal-slide.active .live-proposal'), /box-shadow:/);
  assert.doesNotMatch(css, /rotateY|perspective|preserve-3d/);
});
test('all-history remains full-width vertical cards with no carousel transforms; replay is not decorated', () => {
  const overlay = markup.split('class="history-overlay"')[1].split('<view wx:else class="log-list">')[0];
  const live = markup.split('<template name="live-proposal-record">')[1].split('</template>')[0];
  assert.match(overlay, /<scroll-view[^>]*scroll-y="\{\{true\}\}"/);
  assert.doesNotMatch(overlay + live, /proposal-slide|historyIndex|previous-margin|next-margin/);
  assert.match(overlay, /is="live-proposal-record"/);
  const replay = markup.split('<template name="proposal-record">')[1].split('</template>')[0];
  assert.doesNotMatch(replay, /missionSlots|mission-slot|proposal-status|proposal-slide/);
  const c = component(); c.refresh([entry()], 4, 1, true, true);
  assert.equal(c.data.liveEntries.length, 0);
});
for (const width of [375,390,430]) {
  test(`${width}px carousel fits five large cards, all ten votes and separate adjacent borders`, () => {
    const scale = width / 750, item = width - (76 + 56) * scale;
    const inner = item - (12 + 40) * scale - 2;
    assert.ok((inner - (116 + 12) * scale) / 5 >= 62 * scale);
    const voteColumn = (inner - (108 + 24) * scale) * 1.25 / 2.25;
    // 11 digit glyphs + 9 spaces at 24rpx, conservatively estimated at .6em/.3em.
    assert.ok(voteColumn >= (11 * .6 + 9 * .3) * 24 * scale);
    assert.ok(6 * 2 >= 12, 'two active slides always have at least 12rpx of real gap');
    assert.ok(28 * scale - item * .03 / 2 - 6 * scale * .97 > 0, 'inactive neighbor remains visible');
  });
}
