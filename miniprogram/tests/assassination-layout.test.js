const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const roles = ['MERLIN','PERCIVAL','LOYAL_SERVANT','MORGANA','ASSASSIN','MINION','MORDRED','OBERON'];
function server() {
  const players = roles.map((_,i)=>({playerId:i+1,seatNo:i+1,nickname:i===2?'机器人2':`玩家${i+1}`}));
  return {players,target:null,revision:0,calls:[],phase:'ASSASSINATION',
    snapshot(viewer){return {gameId:7,phase:this.phase,missionNo:3,proposalNo:1,leaderPlayerId:1,
      selectedPlayerIds:[1,2],assassin:viewer==='ASSASSIN',revealedEvilIdentities:roles.slice(3).map((roleCode,i)=>({playerId:i+4,roleCode})),
      assassinationTarget:this.target,assassinationTargetRevision:this.revision};},
    select(id){this.calls.push(id);const p=this.players.find(p=>p.playerId===id);this.target={playerId:p.playerId,seatNo:p.seatNo,nickname:p.nickname};this.revision++;},
  };
}
function fixture(viewer='ASSASSIN',s=server()) {
  let page,modal;const api={
    room:async()=>({roomId:7,currentGameId:7,status:'PLAYING',maxPlayers:10,myPlayerId:roles.indexOf(viewer)+1,players:s.players}),
    game:async()=>s.snapshot(viewer),timeline:async()=>({missions:[],proposals:[]}),
    myRole:async()=>({roleCode:viewer,visiblePlayers:[]}),
    selectAssassinationTarget:async(id,target)=>{assert.equal(id,7);assert.equal(viewer,'ASSASSIN');s.select(target);return s.snapshot(viewer);},
    assassinate:async()=>{throw new Error('Selecting must never perform the final strike');},
  };
  vm.runInNewContext(read('pages/room/room.js'),{Page:value=>{page=value;},clearInterval(){},
    wx:{getStorageSync:()=>0,showModal:value=>{modal=value;}},
    require:name=>name==='../../services/avalon'?api:/services\/auth|utils\/socket/.test(name)?{}:require(path.resolve(root,'pages/room',name)),
  });
  page.data=structuredClone(page.data);page.setData=value=>Object.assign(page.data,value);page.active=true;
  page.setData({roomId:7,room:{roomId:7,maxPlayers:10,myPlayerId:roles.indexOf(viewer)+1,players:s.players},role:{roleCode:viewer,visiblePlayers:[]}});
  page.setData(page.gameStateUpdate(s.snapshot(viewer)));page.decoratePlayers();
  return {page,api,s,modal:()=>modal};
}
for(const viewer of roles) test(`${viewer} gets identical public central copy and amber target after WS refresh`,async()=>{
  const s=server(),f=fixture(viewer,s);
  assert.equal(f.page.data.assassinationText,'等待刺客刺杀');assert.deepEqual(plain(f.page.data.selectedIds),[]);
  s.select(3);f.page.handleRoomEvent({roomId:7,type:'ASSASSINATION_TARGET_CHANGED'});await f.page.refreshing;
  assert.equal(f.page.data.assassinationText,'已选择：3号 机器人2');assert.equal(f.page.data.assassinationTarget,3);
  assert.deepEqual(plain(f.page.data.selectedIds),[3]);
  assert.equal(f.page.data.displayPlayers.find(p=>p.playerId===3).selectionClass,'selected-assassination');
  assert.equal(f.page.data.game.phase,'ASSASSINATION');
  assert.ok(s.players.every(p=>!p.role&&!p.alignment&&!p.knowledgeType));
  if(viewer!=='LOYAL_SERVANT')assert.equal(f.page.data.displayPlayers.find(p=>p.playerId===3).markText,'');
});
test('target mutation waits for server confirmation, can switch, never calls final strike',async()=>{
  const f=fixture();let complete;
  f.api.selectAssassinationTarget=async(id,target)=>{await new Promise(resolve=>{complete=resolve;});f.s.select(target);return f.s.snapshot('ASSASSIN');};
  const pending=f.page.togglePlayer({detail:{playerId:3}});
  assert.equal(f.page.data.busy,true);assert.equal(f.page.data.assassinationTarget,null);assert.equal(f.s.calls.length,0);
  complete();await pending;assert.equal(f.page.data.assassinationText,'已选择：3号 机器人2');
  f.api.selectAssassinationTarget=async(id,target)=>{f.s.select(target);return f.s.snapshot('ASSASSIN');};
  await f.page.togglePlayer({detail:{playerId:2}});
  assert.equal(f.page.data.assassinationText,'已选择：2号 玩家2');assert.deepEqual(f.s.calls,[3,2]);
  assert.equal(f.page.data.game.phase,'ASSASSINATION');assert.equal(f.modal(),undefined);
});
test('rejected mutation leaves target and central text unchanged',async()=>{
  const f=fixture();f.api.selectAssassinationTarget=async()=>{throw new Error('FORBIDDEN');};
  await f.page.togglePlayer({detail:{playerId:3}});
  assert.equal(f.page.data.assassinationTarget,null);assert.equal(f.page.data.assassinationText,'等待刺客刺杀');assert.equal(f.page.data.busy,false);
});
test('late older target snapshot cannot move shared amber marker backwards',()=>{
  const f=fixture();f.s.select(3);const old=f.s.snapshot('ASSASSIN');f.s.select(2);
  f.page.setData(f.page.gameStateUpdate(f.s.snapshot('ASSASSIN')));
  f.page.setData(f.page.gameStateUpdate(old));f.page.decoratePlayers();
  assert.equal(f.page.data.assassinationTarget,2);assert.equal(f.page.data.assassinationText,'已选择：2号 玩家2');
  assert.equal(f.page.data.game.assassinationTargetRevision,2);
});
test('target reset or finished phase clears draft; restart never carries target into another game',()=>{
  const f=fixture();f.s.select(3);f.page.setData(f.page.gameStateUpdate(f.s.snapshot('ASSASSIN')));
  f.s.target=null;f.page.setData(f.page.gameStateUpdate(f.s.snapshot('ASSASSIN')));assert.equal(f.page.data.assassinationTarget,null);
  f.s.select(2);f.page.setData(f.page.gameStateUpdate(f.s.snapshot('ASSASSIN')));f.s.phase='FINISHED';
  f.page.setData(f.page.gameStateUpdate(f.s.snapshot('ASSASSIN')));assert.equal(f.page.data.assassinationTarget,null);
  f.page.setData(f.page.gameStateUpdate({...f.s.snapshot('ASSASSIN'),gameId:8,phase:'ROLE_CONFIRM'}));assert.equal(f.page.data.assassinationTarget,null);
});
test('non-assassin evil self busy and result-overlay cannot send target mutation',async()=>{
  const f=fixture();for(const id of [4,5,6,7,8])await f.page.togglePlayer({detail:{playerId:id}});
  f.page.setData({busy:true});await f.page.togglePlayer({detail:{playerId:3}});f.page.setData({busy:false,missionResultOpen:true});
  await f.page.togglePlayer({detail:{playerId:3}});assert.deepEqual(f.s.calls,[]);
  for(const viewer of roles.filter(r=>r!=='ASSASSIN')){const other=fixture(viewer);await other.page.togglePlayer({detail:{playerId:3}});assert.deepEqual(other.s.calls,[]);}
});
test('public target projection never retains GOOD identity or private vision properties',()=>{
  const s=server();s.select(3);s.target={...s.target,roleCode:'MERLIN',alignment:'GOOD',knowledgeType:'EVIL'};
  assert.deepEqual(ui.assassinationTarget(s.snapshot('ASSASSIN')),{playerId:3,seatNo:3,nickname:'机器人2'});
  assert.equal(ui.assassinationTarget({...s.snapshot('ASSASSIN'),phase:'TEAM_BUILDING'}),null);
  s.target={playerId:4,seatNo:4,nickname:'坏人'};assert.equal(ui.assassinationTarget(s.snapshot('ASSASSIN')),null);
});
test('assassination room reuses full compact history, central two-line copy and existing fixed-action padding',()=>{
  const markup=read('pages/room/room.wxml');
  assert.match(markup,/<game-log\s+wx:if="\{\{board && entries.length\}\}"\s+compact="\{\{true\}\}"/);
  assert.doesNotMatch(markup,/最终刺杀|请选择刺杀梅林|等待刺客选择梅林|game.phase !== 'ASSASSINATION'/);
  assert.match(markup,/<view class="gold">刺杀梅林阶段<\/view>\s*<view class="assassination-selection small">\{\{assassinationText\}\}/);
  assert.match(markup,/bindtap="requestEarlyAssassination">刺杀<\/button>/);assert.doesNotMatch(markup,/>提前刺杀<\/button>/);
  const css=read('pages/room/room.wxss');assert.match(css,/\.game-status-row \{[^}]*flex-wrap: nowrap/);
  assert.match(css,/\.quick-action \{[^}]*min-width: 60rpx;[^}]*padding: 0 6rpx;[^}]*font-size: 21rpx/);
  assert.match(css,/\.has-phase-actions \{\s*padding-bottom: calc\(220rpx/);
  assert.match(read('components/player-seat/player-seat.wxss'),/revealed-evil-ring[^}]*#C85C68/);
});
test('same history component preserves swipe selection, all records and mission cards during assassination',()=>{
  let definition;vm.runInNewContext(read('components/game-log/game-log.js'),{Component:value=>{definition=value;},
    require:name=>require(path.resolve(root,'components/game-log',name))});
  const c={data:structuredClone(definition.data),setData:value=>Object.assign(c.data,value),...definition.methods};
  const entries=[1,2,3].map(id=>({proposalId:id,status:'APPROVED',mission:{missionNo:id,status:'SUCCESS',successCount:2,failCount:0}}));
  definition.observers['entries,gameId,compact,replay,maxMissionSlots'].call(c,entries,7,true,false,5);
  c.data.compact=true;c.data.replay=false;assert.equal(c.data.historyIndex,2);
  c.historyChange({detail:{current:0}});assert.equal(c.data.currentProposalId,1);
  c.historyChange({detail:{current:1}});assert.equal(c.data.currentProposalId,2);
  c.openAllHistory();assert.equal(c.data.allHistoryOpen,true);assert.equal(c.data.allEntries.length,3);
  assert.equal(c.data.liveEntries[0].missionCards.length,2);c.closeAllHistory();assert.equal(c.data.allHistoryOpen,false);
  const markup=read('components/game-log/game-log.wxml');for(const value of ['队长','队伍','同意','反对','任务','查看全部记录'])assert.ok(markup.includes(value));
});
test('target helper submits only player ID to authenticated server endpoint',()=>{
  let call;const context={module:{exports:{}},require:()=>({request:value=>{call=value;}})};
  vm.runInNewContext(read('services/avalon.js'),context);context.module.exports.selectAssassinationTarget(7,3);
  assert.equal(call.url,'/api/avalon/game/7/assassination/target');assert.equal(call.method,'POST');assert.deepEqual(plain(call.data),{targetPlayerId:3});
});
