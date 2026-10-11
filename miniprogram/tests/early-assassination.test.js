const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const ui = require('../utils/presentation');
const plain = value => JSON.parse(JSON.stringify(value));
const roles = ['MERLIN','PERCIVAL','LOYAL_SERVANT','MORGANA','ASSASSIN','MINION','MORDRED','OBERON'];
const evil = roles.slice(3).map((roleCode,i) => ({ playerId:i+4, seatNo:i+4, nickname:`玩家${i+4}`,roleCode }));
const snapshot = phase => ({ gameId:7, missionNo:2, proposalNo:1, phase, assassin:true, goodScore:1,
  leaderPlayerId:5, selectedPlayerIds:[], revealedEvilIdentities:phase==='ASSASSINATION'?evil:[], assassinationEarly:phase==='ASSASSINATION' });
const read = file => fs.readFileSync(path.join(root,file),'utf8');
function fixture(viewer='ASSASSIN', phase='TEAM_BUILDING') {
  let page, modal, calls=0, refreshes=0;
  const players = roles.map((_,i) => ({ playerId:i+1, seatNo:i+1, nickname:`玩家${i+1}`, avatarUrl:'https://images.example/avatar.jpg' }));
  const room = { roomId:7, currentGameId:7, status:'PLAYING', maxPlayers:10, myPlayerId:roles.indexOf(viewer)+1, players };
  const role = { roleCode:viewer, visiblePlayers:[] };
  const api = { startAssassination: async id => { calls++; assert.equal(id,7); return snapshot('ASSASSINATION'); },
    selectAssassinationTarget: async (id,target) => ({...page.data.game,
      assassinationTarget:{playerId:target,seatNo:target,nickname:`玩家${target}`},assassinationTargetRevision:target}) };
  vm.runInNewContext(read('pages/room/room.js'), {
    Page:value=>{page=value;}, wx:{showModal:options=>{modal=options;},getStorageSync:()=>0},
    clearInterval(){}, require:name=>name==='../../services/avalon'?api
      : /services\/auth|utils\/socket/.test(name)?{} : require(path.resolve(root,'pages/room',name)),
  });
  page.data=structuredClone(page.data); page.setData=value=>Object.assign(page.data,value); page.active=true;
  page.setData({roomId:7,room,game:{...snapshot(phase),assassin:viewer==='ASSASSIN'},role});
  page.refreshAfterMutation=async()=>{refreshes++;};
  page.decoratePlayers();
  return {page,api,room,modal:()=>modal,calls:()=>calls,refreshes:()=>refreshes};
}
const settle = async()=>{await new Promise(setImmediate);};

for (const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE']) {
  test(`assassin can request early assassination in ${phase} only after confirmation`, async()=>{
    const f=fixture('ASSASSIN',phase);
    assert.equal(f.page.data.canEarlyAssassination,true);
    const before=plain(f.page.data);
    f.page.requestEarlyAssassination();
    assert.equal(f.calls(),0); assert.deepEqual(plain(f.page.data),before);
    assert.equal(f.modal().title,'发动提前刺杀？'); assert.equal(f.modal().confirmText,'发动刺杀');
    assert.match(f.modal().content,/所有邪恶.*身份/); assert.match(f.modal().content,/不可撤销/);
    f.modal().success({confirm:true}); f.modal().success({confirm:true});
    await settle();
    assert.equal(f.calls(),1); assert.equal(f.refreshes(),1);
    assert.equal(f.page.data.game.phase,'ASSASSINATION'); assert.equal(f.page.data.canEarlyAssassination,false);
    assert.equal(f.page.data.busy,false);
  });
}
test('cancel does not call API change phase or reveal identities',async()=>{
  const f=fixture(); const before=plain(f.page.data);
  f.page.requestEarlyAssassination(); f.modal().success({confirm:false}); await settle();
  assert.equal(f.calls(),0); assert.equal(f.refreshes(),0); assert.deepEqual(plain(f.page.data),before);
});
for(const viewer of roles.filter(role=>role!=='ASSASSIN')) {
  test(`${viewer} has no early assassination control and cannot invoke its handler`,()=>{
    const f=fixture(viewer); assert.equal(f.page.data.canEarlyAssassination,false);
    f.page.requestEarlyAssassination(); assert.equal(f.modal(),undefined); assert.equal(f.calls(),0);
  });
}
for(const phase of ['ROLE_CONFIRM','MISSION_RESULT','ASSASSINATION','FINISHED',null]) {
  test(`early assassination unavailable in ${phase}`,()=>{
    const f=fixture('ASSASSIN',phase); assert.equal(f.page.data.canEarlyAssassination,false);
    f.page.requestEarlyAssassination(); assert.equal(f.modal(),undefined);
  });
}
test('waiting lobby has no early assassination control',()=>{
  const f=fixture(); f.page.setData({game:null}); f.page.decoratePlayers();
  assert.equal(f.page.data.canEarlyAssassination,false); f.page.requestEarlyAssassination(); assert.equal(f.modal(),undefined);
});
test('busy and already-open confirmation never duplicate a request',()=>{
  const f=fixture(); f.page.setData({busy:true}); f.page.requestEarlyAssassination(); assert.equal(f.modal(),undefined);
  f.page.setData({busy:false}); f.page.requestEarlyAssassination(); const first=f.modal();
  f.page.requestEarlyAssassination(); assert.equal(f.modal(),first); assert.equal(f.calls(),0);
});
for(const change of ['room','game','role','phase']) {
  test(`stale confirmation after ${change} change cannot submit`,async()=>{
    const f=fixture(); f.page.requestEarlyAssassination();
    if(change==='room') f.page.setData({roomId:8});
    if(change==='game') f.page.setData({game:{...f.page.data.game,gameId:8}});
    if(change==='role') f.page.setData({role:{roleCode:'MERLIN',visiblePlayers:[]}});
    if(change==='phase') f.page.setData({game:snapshot('ASSASSINATION')});
    f.modal().success({confirm:true}); await settle(); assert.equal(f.calls(),0);
  });
}
test('rechecks phase after pending refresh before POST',async()=>{
  const f=fixture(); let release;
  f.page.refreshing=new Promise(resolve=>{release=resolve;});
  f.page.requestEarlyAssassination(); f.modal().success({confirm:true});
  f.page.setData({game:snapshot('FINISHED')}); release(); await settle(); assert.equal(f.calls(),0);
});
test('server failure does not optimistically expose identities or alter phase',async()=>{
  const f=fixture(); f.api.startAssassination=async()=>{throw new Error('INVALID_PHASE');};
  f.page.requestEarlyAssassination(); f.modal().success({confirm:true}); await settle();
  assert.equal(f.page.data.game.phase,'TEAM_BUILDING'); assert.deepEqual(plain(f.page.data.game.revealedEvilIdentities),[]);
  assert.equal(f.page.data.busy,false); assert.equal(f.refreshes(),0);
});
for(const viewer of roles) {
  test(`${viewer} sees all public evil badges but only their own GOOD badge during assassination`,()=>{
    const f=fixture(viewer,'ASSASSINATION');
    f.page.setData({role:{roleCode:viewer,visiblePlayers:[{playerId:1,knowledgeType:'MERLIN_OR_MORGANA',roleCode:'MERLIN',hint:'secret'}]}});
    f.page.decoratePlayers(); const players=f.page.data.displayPlayers;
    assert.deepEqual(plain(players.filter(p=>p.playerId>=4).map(p=>[p.markText,p.markClass])),[['娜','evil'],['刺','evil'],['爪','evil'],['莫','evil'],['奥','evil']]);
    for(const good of players.filter(p=>p.playerId<=3)) {
      assert.equal(good.markText,good.playerId===f.room.myPlayerId?{MERLIN:'梅',PERCIVAL:'派',LOYAL_SERVANT:'忠'}[viewer]:'');
      assert.equal(good.knowledgeType,undefined); assert.equal(good.roleCode,undefined); assert.equal(good.roleName,undefined);
    }
    assert.equal(players.find(p=>p.playerId===8).markText,'奥','Oberon public even to ordinary evil');
    assert.ok(players.filter(p=>p.playerId>=4).every(p=>p.unselectable && p.revealedEvil && !p.disabled && !p.dimmed));
    assert.ok(f.room.players.every(p=>!p.roleCode&&!p.alignment&&!p.knowledgeType&&!p.markText));
  });
}
test('normal assassination with three successes uses the exact same public evil marks',()=>{
  const f=fixture('PERCIVAL','ASSASSINATION'); f.page.setData({game:{...f.page.data.game,goodScore:3,assassinationEarly:false}});
  f.page.decoratePlayers(); assert.equal(f.page.data.displayPlayers.find(p=>p.playerId===7).markText,'莫');
});
test('reveal fields are ignored outside assassination and never disclose injected GOOD roles',()=>{
  const f=fixture('LOYAL_SERVANT'); f.page.setData({game:{...f.page.data.game,revealedEvilIdentities:evil}}); f.page.decoratePlayers();
  assert.ok(f.page.data.displayPlayers.filter(p=>p.playerId>=4).every(p=>!p.markText));
  f.page.setData({game:{...snapshot('ASSASSINATION'),revealedEvilIdentities:[...evil,{playerId:1,roleCode:'MERLIN'}]}});
  f.page.decoratePlayers(); assert.equal(f.page.data.displayPlayers.find(p=>p.playerId===1).markText,'');
});
test('only another non-revealed player can be selected as assassination target',async()=>{
  const f=fixture('ASSASSIN','ASSASSINATION');
  for(const playerId of [4,5,6,7,8]) f.page.togglePlayer({detail:{playerId}});
  assert.equal(f.page.data.assassinationTarget,null);
  await f.page.togglePlayer({detail:{playerId:1}}); assert.equal(f.page.data.assassinationTarget,1);
  await f.page.togglePlayer({detail:{playerId:2}}); assert.equal(f.page.data.assassinationTarget,2);
  assert.deepEqual(plain(f.page.data.selectedIds),[2]);
  assert.equal(f.page.data.displayPlayers.find(p=>p.playerId===2).selectionClass,'selected-assassination');
  const nonAssassin=fixture('MERLIN','ASSASSINATION'); nonAssassin.page.togglePlayer({detail:{playerId:2}});
  assert.equal(nonAssassin.page.data.assassinationTarget,null);
});
test('assassination cannot regress to task even if stale mutation has a greater mission number',()=>{
  const f=fixture('ASSASSIN','ASSASSINATION');
  assert.equal(f.page.applyGameMutationResult({...snapshot('TEAM_BUILDING'),missionNo:3},{roomId:7,gameId:7}),false);
  assert.equal(f.page.data.game.phase,'ASSASSINATION');
});
test('public badges preserve leader and avatar without replacing another GOOD private identity',()=>{
  const f=fixture('ASSASSIN','ASSASSINATION');
  const own=f.page.data.displayPlayers.find(p=>p.playerId===5);
  assert.equal(own.leader,true); assert.equal(own.markText,'刺'); assert.match(own.avatarUrl,/avatar.jpg/);
  const merlin=fixture('MERLIN'); merlin.page.setData({role:{roleCode:'MERLIN',visiblePlayers:[{playerId:4,knowledgeType:'EVIL'}]}});
  merlin.page.decoratePlayers(); assert.equal(merlin.page.data.displayPlayers.find(p=>p.playerId===4).markType,'EVIL');
  assert.equal(merlin.page.data.displayPlayers.find(p=>p.playerId===7).markText,'','normal Merlin still cannot see Mordred');
});
test('REST helper uses authenticated request and correct start URL',()=>{
  let call; const sandbox={module:{exports:{}},require:()=>({request:options=>{call=options;}})};
  vm.runInNewContext(read('services/avalon.js'),sandbox); sandbox.module.exports.startAssassination(7);
  assert.equal(call.url,'/api/avalon/game/7/assassination/start'); assert.equal(call.method,'POST');
});
test('ASSASSINATION_STARTED invalidation triggers every active viewer refresh',async()=>{
  for(const viewer of roles) {
    const f=fixture(viewer); let refreshes=0;
    f.page.refresh=async()=>{refreshes++;};
    f.page.handleRoomEvent({roomId:7,type:'ASSASSINATION_STARTED'}); await settle();
    assert.equal(refreshes,1);
    f.page.active=false; f.page.handleRoomEvent({roomId:7,type:'ASSASSINATION_STARTED'});
    assert.equal(refreshes,1,'hidden page must not refresh');
  }
});
test('final assassination blocks evil target even if caller bypasses seat handler',()=>{
  const f=fixture('ASSASSIN','ASSASSINATION');
  f.page.setData({assassinationTarget:8}); f.page.assassinate(); assert.equal(f.modal(),undefined);
});
test('UI keeps the role-gated early trigger but unifies the final assassination page copy',()=>{
  const wxml=read('pages/room/room.wxml');
  assert.match(wxml,/wx:if="\{\{canEarlyAssassination\}\}"[^>]*bindtap="requestEarlyAssassination"/);
  assert.doesNotMatch(wxml,/最终刺杀|刺中梅林，邪恶获胜；刺错则正义获胜|请选择刺杀梅林/);
  assert.match(wxml,/刺杀梅林阶段/); assert.match(wxml,/\{\{assassinationText\}\}/);
  assert.match(read('pages/room/room.wxss'),/early-assassination-trigger[^}]+var\(--evil\)/);
  assert.match(ui.FINISH.EARLY_MERLIN_ASSASSINATED,/邪恶获胜/); assert.match(ui.FINISH.EARLY_ASSASSINATION_MISSED,/正义获胜/);
});
