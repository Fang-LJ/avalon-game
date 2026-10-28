const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('pages/room/room.wxml');
function fixture(roleCode = 'LOYAL_SERVANT', phase = 'TEAM_BUILDING', host = false) {
  let p;
  const dialogs = [], calls = [], history = {data:{allHistoryOpen:false},openAllHistory(){this.data.allHistoryOpen=true;}};
  const api = {endGame:async()=>calls.push('end'),leaveRoom:async()=>calls.push('leave'),startAssassination:async()=>calls.push('assassination')};
  vm.runInNewContext(read('pages/room/room.js'), {
    Page:value=>{p=value;},wx:{showModal:o=>dialogs.push(o),reLaunch(){},getStorageSync:()=>0},clearInterval(){},
    require:name=>name==='../../services/avalon'?api:/services\/auth|utils\/socket/.test(name)?{}:require(path.resolve(root,'pages/room',name)),
  });
  p.data=structuredClone(p.data); p.active=true;
  p.setData=(v,cb)=>{Object.assign(p.data,v);if(cb)cb();};
  p.selectComponent=()=>history;p.refresh=async()=>{};p.refreshAfterMutation=async()=>{};
  p.setData({board:true,roomId:1,room:{roomId:1,status:'PLAYING',host,myPlayerId:1,players:[],maxPlayers:5},
    role:{roleCode,visiblePlayers:[]},game:{gameId:2,phase,missionNo:1,proposalNo:1,leaderPlayerId:1,selectedPlayerIds:[]},entries:[{proposalId:1}]});
  const click=action=>p.selectRoomMoreAction({currentTarget:{dataset:{action}}});
  const visible=()=>[...markup.matchAll(/<button[^>]*data-action="([^"]+)"[^>]*>/g)].filter(([tag])=>{
    const condition=tag.match(/wx:if="\{\{(.*?)\}\}"/);return !condition || vm.runInNewContext(condition[1],p.data);
  }).map(([,action])=>action);
  return {p,dialogs,calls,history,click,visible};
}
for(const role of ['MERLIN','MINION','ASSASSIN']) for(const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE','ASSASSINATION']) for(const host of [false,true]) {
  test(`menu authority ${role} ${phase} host=${host}`,()=>{
    const f=fixture(role,phase,host);f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,true);
    const expected=['history','leave'];if(host)expected.push('end');if(role==='ASSASSIN'&&phase!=='ASSASSINATION')expected.push('assassination');
    assert.deepEqual(f.visible(),expected);
    if(!host){f.click('end');assert.equal(f.dialogs.length,0);}
    f.p.openRoomMore();if(role!=='ASSASSIN'||phase==='ASSASSINATION'){f.click('assassination');assert.equal(f.dialogs.length,0);}
  });
}
test('history opens after menu closes; single proposal works and empty history is hidden',()=>{
  const f=fixture();f.p.openRoomMore();f.click('history');assert.equal(f.p.data.moreMenuOpen,false);assert.equal(f.history.data.allHistoryOpen,true);
  f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
  f.history.data.allHistoryOpen=false;f.p.data.entries=[];f.p.openRoomMore();assert.deepEqual(f.visible(),['leave']);
  f.click('history');assert.equal(f.history.data.allHistoryOpen,false);
});
for(const flag of ['busy','missionResultOpen','missionOverlayOpen','roleOverlay','missionDetail','roleGuessSheet','ladyResult']) test(`menu blocked by ${flag}`,()=>{
  const f=fixture();f.p.data[flag]=true;f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
});
for(const phase of ['ROLE_CONFIRM','FINISHED']) test(`menu blocked in ${phase}`,()=>{
  const f=fixture('ASSASSIN',phase);f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
});
for(const action of ['leave','end','assassination']) test(`${action} closes menu, preserves confirmation, cancels safely and prevents repeats`,async()=>{
  const f=fixture('ASSASSIN','TEAM_BUILDING',true);f.p.openRoomMore();f.click(action);f.click(action);
  assert.equal(f.p.data.moreMenuOpen,false);assert.equal(f.dialogs.length,1);assert.deepEqual(f.calls,[]);
  f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
  if(action==='assassination')assert.match(f.dialogs[0].content,/所有邪恶.*身份.*不可撤销.*正义获胜/);
  f.dialogs[0].success({confirm:false});f.dialogs[0].complete?.();await new Promise(setImmediate);assert.deepEqual(f.calls,[]);
  f.p.openRoomMore();f.click(action);f.dialogs[1].success({confirm:true});f.dialogs[1].complete?.();await new Promise(setImmediate);
  assert.deepEqual(f.calls,[action]);
});
for(const change of ['phase','room','game','busy','role','host']) test(`click rechecks live ${change}`,()=>{
  const f=fixture('ASSASSIN','TEAM_BUILDING',true);f.p.openRoomMore();
  if(change==='phase')f.p.data.game.phase='ASSASSINATION';
  if(change==='room')f.p.data.roomId=5;
  if(change==='game')f.p.data.game.gameId=5;
  if(change==='busy')f.p.data.busy=true;
  if(change==='role')f.p.data.role.roleCode='MINION';
  if(change==='host')f.p.data.room.host=false;
  f.click(change==='host'?'end':'assassination');assert.equal(f.dialogs.length,0);assert.deepEqual(f.calls,[]);
});
test('queued close callback rechecks phase before dispatch and blocks reopening',()=>{
  const f=fixture('ASSASSIN');f.p.openRoomMore();let afterRender;
  f.p.setData=(v,cb)=>{Object.assign(f.p.data,v);afterRender=cb;};f.click('assassination');
  f.p.openRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
  f.p.data.game.phase='FINISHED';afterRender();assert.equal(f.dialogs.length,0);
});
test('phase transition, result reveal, secret task, rematch and hide close menu',()=>{
  for(const phase of ['ASSASSINATION','FINISHED','ROLE_CONFIRM']){
    const f=fixture();f.p.openRoomMore();f.p.setData(f.p.gameStateUpdate({...f.p.data.game,phase}));assert.equal(f.p.data.moreMenuOpen,false);
  }
  const f=fixture();f.p.openRoomMore();f.p.setData(f.p.missionResultUpdate({...f.p.data.game,latestMissionResult:{missionNo:1,status:'SUCCESS',successCount:2,failCount:0}}));assert.equal(f.p.data.moreMenuOpen,false);
  const g=fixture('ASSASSIN','MISSION_EXECUTING');g.p.openRoomMore();g.p.data.game.onMission=true;g.p.syncMissionOverlay();assert.equal(g.p.data.moreMenuOpen,false);assert.equal(g.p.data.missionOverlayOpen,true);
  const h=fixture();h.p.openRoomMore();h.p.handleRoomEvent({type:'REMATCH_CREATED',roomId:3});assert.equal(h.p.data.moreMenuOpen,false);
  const i=fixture();i.p.openRoomMore();i.p.onHide();assert.equal(i.p.data.moreMenuOpen,false);
});
test('same-scope refresh retains menu; background seats and overlays cannot act',async()=>{
  const f=fixture();f.p.setData(f.p.gameStateUpdate(f.p.data.game));f.p.openRoomMore();f.p.setData(f.p.gameStateUpdate(f.p.data.game));assert.equal(f.p.data.moreMenuOpen,true);
  f.p.togglePlayer({detail:{playerId:2}});f.p.openRoleOverlay();f.p.openMissionDetail({detail:{missionNo:1}});
  await f.p.run(()=>f.calls.push('background'));await f.p.runGameMutation(()=>f.calls.push('background'));
  assert.deepEqual(f.calls,[]);assert.equal(f.p.data.roleOverlay,false);assert.equal(f.p.data.missionDetail,null);
  f.p.closeRoomMore();assert.equal(f.p.data.moreMenuOpen,false);
});
test('markup captures mask taps and touch movement while dialog stops bubbling; final assassination action remains',()=>{
  assert.match(markup,/class="room-more-overlay" catchtap="closeRoomMore" catchtouchmove="ignoreTap"/);
  assert.match(markup,/class="room-more-dialog" catchtap="ignoreTap"/);
  assert.doesNotMatch(read('pages/room/room.js').split('  openRoomMore() {')[1].split('  openRoleOverlay() {')[0],/showActionSheet/);
  const row=markup.split('class="game-status-row">')[1].split('<block wx:else>')[0];
  assert.equal((row.match(/<button/g)||[]).length,2);assert.doesNotMatch(row,/刺杀/);
  assert.match(markup,/wx:elif="\{\{game.phase === 'ASSASSINATION'\}\}"\s*class="btn danger"\s*disabled="\{\{!game.assassin \|\| !assassinationTarget \|\| busy\}\}"\s*bindtap="assassinate"/);
});
