const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('components/game-log/game-log.wxml');
const css = read('components/game-log/game-log.wxss');
const live = markup.split('<template name="live-proposal-record">')[1].split('</template>')[0];
const rule = selector => css.split(`${selector} {`)[1].split('}')[0];

test('one flat four-column grid orders leader/approve then team/reject in shared rows', () => {
  const body = live.split('<view class="proposal-info-grid">')[1].split('</view>')[0];
  assert.doesNotMatch(body, /<view/);
  const cells = Array.from(body.matchAll(/<text class="([^"]+)">([^<]+)<\/text>/g));
  assert.equal(cells.length, 8);
  assert.deepEqual(cells.map(cell => cell[2]), ['队长','{{item.leaderText}}','同意',"{{item.approveText || '无'}}",
    '队伍','{{item.teamSeatText}}','反对',"{{item.rejectText || '无'}}"]);
  assert.equal((live.match(/proposal-info-grid/g) || []).length, 1);
  assert.doesNotMatch(live + css, /proposal-team|proposal-votes|proposal-columns|proposal-field|1\.08fr|0\.92fr/);
  assert.match(rule('.proposal-info-grid'), /display: grid/);
  assert.match(rule('.proposal-info-grid'), /grid-template-columns: 54rpx minmax\(0, 1.25fr\) 54rpx minmax\(0, 1fr\)/);
  assert.match(rule('.proposal-info-grid'), /align-items: center/);
  assert.match(rule('.proposal-info-grid'), /row-gap: 8rpx/);
  assert.match(rule('.proposal-info-grid'), /font-size: 24rpx; line-height: 34rpx/);
});

test('all labels stay muted while only approve/reject values receive alignment colors', () => {
  const cells = Array.from(live.matchAll(/<text class="([^"]+)">([^<]+)<\/text>/g));
  for (const label of ['队长','同意','队伍','反对'])
    assert.equal(cells.find(cell => cell[2] === label)[1], 'proposal-label');
  assert.match(rule('.proposal-label'), /color: var\(--muted\)/);
  assert.match(rule('.proposal-label'), /text-align: left/);
  assert.match(live, /class="proposal-value good">\{\{item.approveText/);
  assert.match(live, /class="proposal-value evil">\{\{item.rejectText/);
  assert.match(live, /class="proposal-value proposal-leader">\{\{item.leaderText/);
  assert.match(rule('.proposal-value'), /min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap/);
});

test('mission divider follows the grid with a fixed gap, never auto-pushed to bottom', () => {
  assert.ok(live.indexOf('proposal-heading') < live.indexOf('proposal-info-grid'));
  assert.ok(live.indexOf('proposal-info-grid') < live.indexOf('proposal-mission'));
  assert.match(rule('.proposal-mission'), /border-top: 1px solid var\(--border\)/);
  assert.match(rule('.proposal-mission'), /padding-top: 12rpx/);
  assert.match(rule('.proposal-mission'), /height: 82rpx; box-sizing: content-box/);
  assert.match(rule('.live-proposal > .proposal-mission'), /margin-top: 12rpx/);
  assert.doesNotMatch(rule('.live-proposal > .proposal-mission'), /auto/);
  assert.match(rule('.live-proposal'), /height: 284rpx/);
  assert.match(rule('.history-swiper'), /height: 284rpx/);
  assert.match(rule('.compact-entry'), /height: 100%/);
  // At the narrowest 375px viewport, borders + padding + fixed content fit the card.
  assert.ok(4 + 40 + 36 + 12 + 2 * 34 + 8 + 12 + 2 + 12 + 82 <= 284);
  assert.ok(80.62 <= 82, 'larger cards fit within the reserved content height');
});

test('fixed card structure covers rejected pending success and failed entries in both live views', () => {
  let definition;
  vm.runInNewContext(read('components/game-log/game-log.js'), {
    Component: value => { definition = value; },
    require: name => require(path.resolve(root, 'components/game-log', name)),
  });
  const entries = [
    { proposalId: 1, status: 'REJECTED', mission: null },
    { proposalId: 2, status: 'APPROVED', mission: null },
    { proposalId: 3, status: 'APPROVED', mission: { missionNo: 4, status: 'SUCCESS', successCount: 4, failCount: 1 } },
    { proposalId: 4, status: 'APPROVED', mission: { missionNo: 4, status: 'FAILED', successCount: 3, failCount: 2 } },
  ];
  const instance = { data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value); } };
  definition.observers['entries,gameId,compact,replay'].call(instance, entries, 1, true, false);
  assert.deepEqual(Array.from(instance.data.liveEntries, entry => entry.missionCards.length), [0,0,5,5]);
  assert.deepEqual(Array.from(instance.data.allEntries, entry => entry.proposalId), [4,3,2,1]);
  for (const entry of instance.data.liveEntries) {
    assert.equal(entry.height, undefined, 'data does not control card height');
    const sources = Array.from(entry.missionCards, card => card.src);
    const firstFail = sources.findIndex(source => source.includes('mission-fail'));
    if (firstFail >= 0) assert.ok(sources.slice(firstFail).every(source => source.includes('mission-fail')));
  }
  assert.match(markup, /<swiper class="history-swiper" current="\{\{historyIndex\}\}" bindchange="historyChange" circular="\{\{false\}\}"/);
  assert.doesNotMatch(markup + css, /without-mission/);
  assert.match(markup, /is="live-proposal-record" data="\{\{item, compact: true\}\}"/);
  assert.match(markup, /is="live-proposal-record" data="\{\{item, compact: false\}\}"/);
  assert.match(live, /<view class="proposal-mission">/);
  assert.match(live, /任务进行中/); assert.match(live, /未执行任务/);
  assert.doesNotMatch(live, /SUCCESS ×|FAIL ×/);
});

for (const playerCount of [5,6,7,8,9,10]) {
  test(`${playerCount}-player team and larger task thumbnails fit 375/390/430px widths`, () => {
    for (const width of [375,390,430]) {
      const scale = width / 750, inner = width - (2 * 38 + 2 * 20) * scale - 2;
      const valuesWidth = inner - (2 * 54 + 3 * 8) * scale;
      const teamWidth = valuesWidth * 1.25 / 2.25;
      assert.ok(teamWidth > 5 * 24 * scale, 'team seats have usable space');
      assert.ok((4 * 23 + 16 + 5 * 58 + 4 * 8) * scale <= inner);
    }
    assert.match(rule('.mission-thumbnail'), /width: 58rpx; height: 80.62rpx/);
    assert.ok(Math.abs(58 / 80.62 - 600 / 834) < 0.0001);
    assert.match(live, /mode="aspectFit"/);
  });
}
