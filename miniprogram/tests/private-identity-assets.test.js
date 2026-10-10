const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const { CARDS, CARD_BASE } = require('../utils/cards');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const roleMarks = { MERLIN:'梅', PERCIVAL:'派', LOYAL_SERVANT:'忠', MORGANA:'娜',
  ASSASSIN:'刺', MINION:'爪', MORDRED:'莫', OBERON:'奥' };
const evil = ['MORGANA','ASSASSIN','MINION','MORDRED'];
for (const [code, text] of Object.entries(roleMarks)) {
  test(`${code} self mark is ${text} and wins over any knowledge mark`, () => {
    for (const knowledgeType of [undefined,'EVIL','EVIL_ALLY','MERLIN_OR_MORGANA']) {
      const mark = ui.identityMark({knowledgeType,roleCode:'ASSASSIN'}, code, true);
      assert.equal(mark.markType,'ROLE'); assert.equal(mark.markText,text);
      assert.equal(mark.markClass, ['MERLIN','PERCIVAL'].includes(code) ? code.toLowerCase() : code === 'LOYAL_SERVANT' ? 'loyal' : 'evil');
    }
  });
}
for (const viewer of evil) test(`${viewer} sees exact ordinary evil teammates, never Oberon`, () => {
  for (const target of evil) {
    const mark = ui.identityMark({knowledgeType:'EVIL_ALLY',roleCode:target},viewer);
    assert.deepEqual(mark,{markType:'ROLE',markText:roleMarks[target],markClass:'evil'});
    const privateView = ui.privateVisiblePlayer({knowledgeType:'EVIL_ALLY',roleCode:target,roleName:'untrusted'},viewer);
    assert.equal(privateView.roleName,ui.ROLE_NAMES[target]);
  }
  assert.equal(ui.identityMark({knowledgeType:'EVIL_ALLY',roleCode:'OBERON'},viewer).markType,'');
});
test('Merlin sees only red moons even if accidental exact role metadata is present', () => {
  for (const roleCode of ['MORGANA','ASSASSIN','MINION','OBERON']) {
    const visible = ui.privateVisiblePlayer({knowledgeType:'EVIL',roleCode,roleName:ui.ROLE_NAMES[roleCode]},'MERLIN');
    assert.equal(visible.markType,'EVIL'); assert.equal(visible.markText,'');
    assert.equal('roleCode' in visible,false); assert.equal('roleName' in visible,false);
  }
  assert.equal(ui.identityMark({},'MERLIN').markType,''); // Mordred is absent from /my-role visibility.
});
test('Percival candidates have identical full mark/UI metadata without exact identity', () => {
  const a = ui.privateVisiblePlayer({knowledgeType:'MERLIN_OR_MORGANA',roleCode:'MERLIN',hint:'梅林或莫甘娜'},'PERCIVAL');
  const b = ui.privateVisiblePlayer({knowledgeType:'MERLIN_OR_MORGANA',roleCode:'MORGANA',hint:'梅林或莫甘娜'},'PERCIVAL');
  assert.deepEqual(a,b); assert.equal(a.markText,'?'); assert.equal(a.markClass,'candidate');
  assert.equal('roleCode' in a,false); assert.equal('roleName' in a,false);
});
for (const viewer of ['LOYAL_SERVANT','OBERON']) test(`${viewer} has no teammate marks`, () => {
  for (const knowledgeType of ['EVIL','EVIL_ALLY','MERLIN_OR_MORGANA'])
    assert.equal(ui.identityMark({knowledgeType,roleCode:'ASSASSIN'},viewer).markType,'');
});
function page() {
  let definition;
  vm.runInNewContext(read('pages/room/room.js'), {
    Page: value => { definition=value; },
    require: request => request.startsWith('../../utils/') ? require(path.resolve(root,'pages/room',request)) : {},
    setInterval,clearInterval,
  });
  return {...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};
}
test('room decoration projects local marks, preserves public players, and supports all four badge layers', () => {
  const players = [{playerId:1,seatNo:1,nickname:'自己',me:true},{playerId:2,seatNo:2,nickname:'同伴'}];
  const original = JSON.stringify(players);
  const p=page();p.setData({room:{players,maxPlayers:5,myPlayerId:1},game:{phase:'TEAM_VOTING',leaderPlayerId:1,votedPlayerIds:[1]},
    selectedIds:[1],role:{roleCode:'MORGANA',visiblePlayers:[{playerId:2,knowledgeType:'EVIL_ALLY',roleCode:'ASSASSIN'}]}});
  p.decoratePlayers();
  const own = p.data.displayPlayers.find(v=>v.playerId===1), ally=p.data.displayPlayers.find(v=>v.playerId===2);
  assert.equal(own.markText,'娜');assert.equal(ally.markText,'刺');
  assert.ok(own.leader&&own.selected&&own.actionDone&&own.me);
  assert.equal(JSON.stringify(players),original);
  assert.ok(p.data.displayPlayers.every(v=>!('roleCode' in v)&&!('roleName' in v)&&!('alignment' in v)));
  p.data.game=null;p.decoratePlayers();assert.ok(p.data.displayPlayers.every(v=>!v.markType&&!v.knowledgeType));
});
test('identity overlay and dealt identity share authorized character marks and role names', () => {
  for (const file of ['pages/room/room.wxml','components/card-deal-stage/card-deal-stage.wxml']) {
    const markup=read(file);assert.match(markup,/item.markType === 'ROLE'/);assert.match(markup,/item.roleName/);
    assert.match(markup,/markType="\{\{item.markType\}\}"/);assert.doesNotMatch(markup,/item.roleCode/);
  }
});
test('crown and identity grow independently, action tick stays 30rpx, compact badges fit 9/10 seats', () => {
  const css=read('components/player-seat/player-seat.wxss');
  const rule=name=>css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))[1];
  assert.match(rule('leader-icon'),/width: 42rpx/);assert.match(rule('leader-icon'),/height: 42rpx/);
  assert.match(rule('knowledge-icon'),/width: 38rpx/);assert.match(rule('knowledge-icon'),/height: 38rpx/);
  assert.match(rule('action-done-icon'),/width: 30rpx/);assert.doesNotMatch(rule('action-done-icon'),/height:/);
  assert.match(css,/\.formal.compact .leader-icon \{ width: 36rpx; height: 36rpx;/);
  assert.match(css,/\.formal.compact .knowledge-icon \{ width: 34rpx; height: 34rpx;/);
  const mark=read('components/knowledge-mark/knowledge-mark.wxss');assert.match(mark,/font-size: 24rpx/);assert.match(mark,/font-size: 22rpx/);
  for (const color of ['#6f2833','#c86472','#fff2f2','#255c62','#66c5c6','#dcffff','#594a22','#e2bf62','#f5dc91','#493a69','#b69cff','#f1eaff'])assert.ok(mark.includes(color));
  for(const n of [5,6,7,8,9,10])assert.equal(new Set(Array.from({length:n},(_,i)=>ui.seatPosition(i+1,n,true))).size,n);
});
test('local and prod cards use one HTTPS versioned base without changing login modes', () => {
  for (const env of ['local','prod']) {
    const module={exports:{}};vm.runInNewContext(read('utils/config.js').replace("const ENV = 'prod'",`const ENV = '${env}'`),{module});
    assert.equal(module.exports.getConfig().cardBaseUrl,CARD_BASE);
    assert.equal(module.exports.getConfig().mockLogin,env==='local');
  }
  assert.equal(CARD_BASE,'https://api.playmatespace.cloud/avalon-assets/cards/v1');
  assert.ok(Object.values(CARDS).flatMap(Object.values).every(url=>url.startsWith(CARD_BASE+'/')&&!url.includes('?')));
});
test('anonymous policy permits only GetObject for versioned cards, no listing/write permissions', () => {
  const policy=JSON.parse(fs.readFileSync(path.join(root,'../static-assets/avalon/public-policy.json'),'utf8'));
  assert.equal(policy.Statement.length,1);
  assert.deepEqual(policy.Statement[0].Action,['s3:GetObject']);
  assert.deepEqual(policy.Statement[0].Resource,['arn:aws:s3:::avalon-assets/cards/v1/*']);
});
