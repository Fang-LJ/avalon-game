const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const { CARDS, CARD_BASE } = require('../utils/cards');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('pages/room/room.wxml');
const lobby = markup.split('<view class="card lobby-card">')[1].split('<view class="section-title lobby-label">')[0];
for (const [currentPlayers,maxPlayers,seatedPlayers,expected] of [
  [1,5,1,'1 / 5 人 · 等待 4 人加入'],
  [3,7,3,'3 / 7 人 · 等待 4 人加入'],
  [5,5,5,'5 / 5 人 · 全员已就座'],
  [7,7,7,'7 / 7 人 · 全员已就座'],
  [7,7,6,'7 / 7 人 · 6 人已就座'],
  [7,7,0,'7 / 7 人 · 0 人已就座'],
]) test(`lobby status: ${expected}`, () => {
  const room = Object.freeze({currentPlayers,maxPlayers,seatedPlayers});
  assert.equal(ui.lobbyStatus(room), expected);
  if (seatedPlayers < maxPlayers) assert.ok(!ui.lobbyStatus(room).includes('全员已就座'));
});

test('room refresh updates lobby status from current membership and seats, not canStart', () => {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {Page:value=>{page=value;},
    require:name => /services\/avalon|services\/auth|utils\/socket/.test(name) ? {} : require(path.resolve(root,'pages/room',name)), wx:{}});
  page.data = {...page.data,game:null}; page.setData = values => Object.assign(page.data,values);
  for (const [currentPlayers,seatedPlayers] of [[1,1],[5,5],[5,4]]) {
    page.data.room = {currentPlayers,seatedPlayers,maxPlayers:5,canStart:false,players:[]};
    page.decoratePlayers(); assert.equal(page.data.lobbyStatus,ui.lobbyStatus(page.data.room));
  }
});

test('lobby is one compact room heading, one status line, unchanged share/copy row', () => {
  assert.match(markup,/!game \? room.maxPlayers \+ ' 人局'/);
  assert.match(lobby,/房间 <text class="lobby-room-code gold">\{\{room.roomCode\}\}/);
  assert.equal((lobby.match(/\{\{room.roomCode\}\}/g)||[]).length,1);
  assert.match(lobby,/class="muted small lobby-player-count">\{\{lobbyStatus\}\}/);
  assert.doesNotMatch(lobby,/邀请好友加入|房间号|等待全员入座|可以开始游戏|lobby-status/);
  assert.match(lobby,/open-type="share">邀请好友/);
  assert.match(lobby,/bindtap="copyCode">复制房号/);
  assert.match(lobby,/wx:if="\{\{room.host\}\}" class="lobby-close-action/);
  assert.match(markup,/room.mySeatNo \? '我的座位' : '请选择座位'/);
  const css = read('pages/room/room.wxss');
  assert.match(css,/\.lobby-room-code \{\s*font-size: 38rpx;\s*font-weight: 700/);
  assert.match(css,/\.lobby-label \{\s*margin-top: 30rpx/);
  assert.match(css,/grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/);
  assert.match(markup,/disabled="\{\{!room.canStart \|\| busy\}\}"/);
});

test('v2 provenance has exactly 19 original PNG crops, 2x dimensions, RGB pixels and matching hashes', () => {
  const report = JSON.parse(read('../static-assets/avalon/card-export-v2.json'));
  assert.equal(report.version,'v2'); assert.equal(report.scale,2); assert.equal(report.resampling,'LANCZOS');
  assert.deepEqual(report.sources.map(s=>s.source),['01-actions.png','02-special.png','03-roles.png']);
  assert.ok(report.sources.every(s=>s.width===1448&&s.height===1086&&s.mode==='RGB'&&s.format==='PNG'));
  const paths = Object.values(CARDS).flatMap(Object.values).map(url=>url.slice(CARD_BASE.length+1));
  assert.deepEqual(report.assets.map(a=>a.asset).sort(),paths.sort());
  let total = 0;
  for (const asset of report.assets) {
    const bytes = fs.readFileSync(path.join(root,'../static-assets/avalon/cards/v2',asset.asset));
    assert.equal(asset.source_crop_width,asset.crop[2]-asset.crop[0]);
    assert.equal(asset.source_crop_height,asset.crop[3]-asset.crop[1]);
    assert.equal(asset.export_width,asset.source_crop_width*2); assert.equal(asset.export_height,asset.source_crop_height*2);
    assert.equal(asset.export_width,bytes.readUInt32BE(16)); assert.equal(asset.export_height,bytes.readUInt32BE(20));
    assert.equal(asset.format,'PNG'); assert.equal(asset.mode,'RGB'); assert.equal(bytes[25],2);
    assert.equal(asset.bytes,bytes.length); assert.equal(asset.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    total += bytes.length;
    assert.ok(fs.existsSync(path.join(root,'../static-assets/avalon/cards/v1',asset.asset.replace(/\.png$/,'.jpg'))));
  }
  assert.equal(total,report.total_bytes);
  assert.doesNotMatch(read('utils/cards.js'),/\.jpg|\.webp/);
  assert.equal(fs.existsSync(path.join(root,'assets/cards')),false);
});

test('publisher only adds v2 objects and read policy; verifies v1 and rejects immutable collisions', () => {
  const script = read('../scripts/publish-card-assets-container.sh');
  assert.match(script,/Content-Type=image\/png/);
  assert.match(script,/Immutable collision/);
  assert.match(script,/v1-before.sha256/); assert.match(script,/v1-after.sha256/);
  assert.match(script,/Unexpected bucket policy; refusing to replace it/);
  assert.doesNotMatch(script,/mc mb|mc rm|mc anonymous set public|s3:ListBucket|s3:PutObject|s3:DeleteObject/);
  assert.match(read('../scripts/check-card-assets.js'),/for \(const method of \['HEAD', 'GET'\]\)/);
  assert.match(read('../scripts/check-card-assets.js'),/GET content mismatch/);
});
