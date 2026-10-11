const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const layouts = {
  7: ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGANA', 'ASSASSIN', 'OBERON'],
  10: ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON'],
};
function fixture(n, viewerSeat, phase = 'ASSASSINATION') {
  const roles = layouts[n];
  // Game-player IDs deliberately differ from user IDs, seats and array indices.
  const players = roles.map((_, i) => ({playerId: 901 + i, userId: 4201 + i,
    seatNo: i + 1, nickname: i === 2 ? '机器人2' : `玩家${i + 1}`}));
  const roleCode = roles[viewerSeat - 1];
  const revealed = players.flatMap((p, i) => ['MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON'].includes(roles[i])
    ? [{playerId:p.playerId, seatNo:p.seatNo, nickname:p.nickname, roleCode:roles[i]}] : []);
  const game = {gameId:71, phase, missionNo:2, proposalNo:1, leaderPlayerId:players[0].playerId,
    playerCount:n, selectedPlayerIds:[], revealedEvilIdentities:revealed,
    assassin:roleCode === 'ASSASSIN', assassinationTarget:null};
  const room = {roomId:71, currentGameId:71, status:'PLAYING', maxPlayers:n,
    myPlayerId:players[viewerSeat - 1].playerId, players:players.slice().reverse()};
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/room/room.js'), 'utf8'), {
    Page:value => {page = value;}, wx:{getStorageSync:()=>0}, clearInterval(){},
    require:name => /services\/|utils\/socket/.test(name) ? {} : require(path.resolve(root,'pages/room',name)),
  });
  page.data = structuredClone(page.data);
  page.setData = value => Object.assign(page.data, value);
  page.setData({room, roomId:71, role:{roleCode, visiblePlayers:[]}});
  page.setData(page.gameStateUpdate(game));
  page.decoratePlayers();
  return {page, room, game, revealed, roles};
}
for (const n of [7, 10]) for (let seat = 1; seat <= n; seat++) {
  test(`${n}-player seat ${seat}: public evil IDs reach seat badges and rings, including Oberon`, () => {
    const {page, room, game, revealed} = fixture(n, seat);
    assert.equal(ui.revealedEvilIdentities(game).length, n === 7 ? 3 : 4);
    const expected = n === 7 ? ['娜', '刺', '奥'] : ['娜', '刺', '莫', '奥'];
    assert.deepEqual(plain(page.data.displayPlayers.filter(p => p.revealedEvil)
      .sort((a,b) => a.seatNo - b.seatNo).map(p => p.markText)), expected);
    for (const identity of revealed) {
      const player = page.data.displayPlayers.find(p => p.playerId === identity.playerId);
      assert.equal(player.markType,'ROLE'); assert.equal(player.markClass,'evil');
      assert.equal(player.revealedEvil,true); assert.equal(player.unselectable,true);
      assert.equal(player.position,ui.seatPosition(player.seatNo,n,true));
    }
    for (const p of page.data.displayPlayers.filter(p => !p.revealedEvil && p.playerId !== room.myPlayerId)) {
      assert.equal(p.markText,''); assert.equal(p.roleCode,undefined);
      assert.equal(p.alignment,undefined); assert.equal(p.knowledgeType,undefined);
    }
    assert.ok(room.players.every(p => !p.roleCode && !p.alignment && !p.markText));
    assert.equal(page.data.assassinationText,'等待刺客刺杀');
    page.setData(page.gameStateUpdate({...game, assassinationTarget:{playerId:903,seatNo:3,nickname:'机器人2'}}));
    page.decoratePlayers();
    assert.equal(page.data.assassinationText,'已选择：3号 机器人2');
    assert.equal(page.data.displayPlayers.find(p => p.playerId === 903).selectionClass,'selected-assassination');
  });
}
for (const phase of ['ROLE_CONFIRM','TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE']) {
  test(`7-player ${phase}: public reveal ignored and ordinary evil cannot infer Oberon`, () => {
    const f = fixture(7,6,phase);
    f.page.setData({role:{roleCode:'ASSASSIN', visiblePlayers:[
      {playerId:905, knowledgeType:'EVIL_ALLY', roleCode:'MORGANA'},
      // Defense in depth: an accidental private Oberon field still cannot create a public badge.
      {playerId:907, knowledgeType:'EVIL_ALLY', roleCode:'OBERON'},
    ]}});
    f.page.decoratePlayers();
    assert.equal(f.page.data.displayPlayers.find(p => p.playerId===905).markText,'娜');
    const oberon = f.page.data.displayPlayers.find(p => p.playerId===907);
    assert.equal(oberon.markText,''); assert.equal(oberon.revealedEvil,false);
    const o = fixture(7,7,phase);
    assert.ok(o.page.data.displayPlayers.filter(p => p.playerId!==907).every(p => !p.markText && !p.revealedEvil));
  });
}
test('render bindings retain both public ring and exact identity badge without exposing GOOD roles', () => {
  const seat = fs.readFileSync(path.join(root,'components/player-seat/player-seat.wxml'),'utf8');
  assert.match(seat,/player.revealedEvil \? 'revealed-evil-ring'/);
  assert.match(seat,/wx:if="\{\{player.markType \|\| player.knowledgeType\}\}"/);
  assert.match(seat,/markType="\{\{player.markType\}\}" text="\{\{player.markText\}\}" tone="\{\{player.markClass\}\}"/);
  const badge = fs.readFileSync(path.join(root,'components/knowledge-mark/knowledge-mark.wxml'),'utf8');
  assert.match(badge,/markType === 'ROLE'/); assert.match(badge,/\{\{text\}\}/);
});
