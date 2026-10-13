const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sync=require('../utils/team-draft');
const root=path.resolve(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const game=(n=7)=>({gameId:90,missionNo:1,proposalNo:1,leaderPlayerId:1,requiredTeamSize:n>=7?3:2,phase:'TEAM_BUILDING',selectedPlayerIds:[],consecutiveRejections:0,maxRejections:5});
const draft=g=>({...g,selectedPlayerIds:[],nominatedPlayerIds:[],nominated:false,revision:0});
function roomFixture(n=7){
  let g=game(n),d=sync.normalize(draft(g),g);const calls=[],pages=[];
  const room={roomId:90,currentGameId:90,maxPlayers:n,players:Array.from({length:n},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:'P'+(i+1),seated:true}))};
  const notify=()=>pages.forEach(p=>p.handleRoomEvent({roomId:90,type:'TEAM_DRAFT_UPDATED',teamDraft:plain(d)}));
  const api={
    room:async()=>room,timeline:async()=>({missions:[],proposals:[]}),myRole:async()=>({roleCode:'LOYAL_SERVANT',visiblePlayers:[]}),
    game:async()=>({...g,teamDraft:g.phase==='TEAM_BUILDING'?plain(d):null}),
    updateTeamDraft:async(id,r)=>{calls.push(['draft',plain(r)]);assert.equal(r.expectedRevision,d.revision);d={...d,selectedPlayerIds:r.playerIds.slice(),revision:d.revision+1};notify();return plain(d);},
    nominateTeam:async(id,r)=>{calls.push(['nominate',plain(r)]);assert.equal(d.nominated,false);assert.equal(r.expectedRevision,d.revision);d={...d,nominated:true,nominatedPlayerIds:d.selectedPlayerIds.slice(),revision:d.revision+1};notify();return plain(d);},
    submitTeam:async(id,ids,context)=>{calls.push(['team',ids.slice(),context]);assert.equal(context.expectedDraftRevision,d.revision);assert.deepEqual(ids,d.selectedPlayerIds);g={...g,phase:'TEAM_VOTING',selectedPlayerIds:ids.slice()};return {...g,teamDraft:null};},
  };
  function page(viewer=1){
    let p;vm.runInNewContext(fs.readFileSync(path.join(root,'pages/room/room.js'),'utf8'),{Page:v=>{p=v;},clearInterval(){},wx:{showToast(){}},require:name=>name==='../../services/avalon'?api:/services\/auth|utils\/socket/.test(name)?{}:require(path.resolve(root,'pages/room',name))});
    p.data=structuredClone(p.data);p.setData=v=>Object.assign(p.data,v);p.active=true;
    p.setData({roomId:90,room:{...room,myPlayerId:viewer,players:room.players.map(p=>({...p,me:p.playerId===viewer}))},role:{roleCode:'LOYAL_SERVANT',visiblePlayers:[]}});
    p.setData(p.gameStateUpdate({...g,teamDraft:plain(d)}));p.decoratePlayers();p.refreshAfterMutation=async()=>{};pages.push(p);return p;
  }
  return {page,api,calls,notify,get draft(){return d;},get game(){return g;},setDraft:v=>{d=v;notify();}};
}
const select=(p,id)=>p.togglePlayer({detail:{playerId:id}});
for(const n of [5,6,7,8,9,10])test(`${n} players: every viewer shares selection, cancellation, FIFO replacement and center numbers`,async()=>{
  const f=roomFixture(n),leader=f.page(),viewers=Array.from({length:n-1},(_,i)=>f.page(i+2));
  for(let i=1;i<=leader.data.game.requiredTeamSize;i++){select(leader,i);await leader.teamSync.flush();for(const p of viewers)assert.deepEqual(plain(p.data.selectedIds),Array.from({length:i},(_,j)=>j+1));}
  select(leader,n);await leader.teamSync.flush();assert.equal(leader.data.selectedIds.includes(1),false);
  select(leader,2);await leader.teamSync.flush();for(const p of viewers){assert.deepEqual(p.data.selectedIds,leader.data.selectedIds);assert.equal(p.data.selectedText,leader.data.selectedText);}
  const before=f.calls.length;select(viewers[0],1);assert.equal(f.calls.length,before);assert.equal(viewers[0].data.displayPlayers.filter(p=>p.selected).length,leader.data.selectedIds.length);
});
test('nomination locks only the first public list; edits, latest halos, dispatch and vote copy remain independent',async()=>{
  const f=roomFixture(),p=f.page(),viewer=f.page(2);[1,2,3].forEach(id=>select(p,id));await p.nominateTeam();
  assert.equal(p.data.game.phase,'TEAM_BUILDING');assert.equal(p.data.game.proposalNo,1);assert.equal(p.data.teamNominated,true);assert.equal(viewer.data.nominatedText,'1 · 2 · 3');
  [4,5,6].forEach(id=>select(p,id));await p.teamSync.flush();assert.deepEqual(plain(viewer.data.selectedIds),[4,5,6]);assert.equal(viewer.data.nominatedText,'1 · 2 · 3');
  await p.nominateTeam();assert.equal(f.calls.filter(c=>c[0]==='nominate').length,1);
  await p.submitTeam();assert.equal(p.data.game.phase,'TEAM_VOTING');assert.equal(p.data.selectedText,'4 · 5 · 6');assert.equal(p.data.teamNominated,false);assert.equal(p.teamSync,null);
});
test('direct dispatch waits for all rapid selections to be acknowledged and skips nomination',async()=>{
  const f=roomFixture(),p=f.page();const gate=deferred(),send=f.api.updateTeamDraft;let first=true;
  f.api.updateTeamDraft=async(...args)=>{if(first){first=false;await gate.promise;}return send(...args);};
  [1,2,3,4,5,6].forEach(id=>select(p,id));const pending=p.submitTeam();await new Promise(setImmediate);
  assert.equal(f.calls.filter(c=>c[0]==='team').length,0);gate.resolve();await pending;
  assert.deepEqual(f.calls.find(c=>c[0]==='team')[1],[4,5,6]);assert.equal(f.calls.some(c=>c[0]==='nominate'),false);
});
test('failed draft blocks final dispatch; explicit retry recovers server acknowledgement before sending',async()=>{
  const f=roomFixture(),p=f.page();const real=f.api.updateTeamDraft;f.api.updateTeamDraft=async()=>{throw Error('offline');};
  [1,2,3].forEach(id=>select(p,id));await assert.rejects(p.teamSync.flush());assert.ok(p.data.teamSyncError);await p.submitTeam();assert.equal(f.calls.length,0);
  f.api.updateTeamDraft=real;await p.retryTeamDraft();assert.equal(p.data.teamSyncError,'');await p.submitTeam();assert.deepEqual(f.calls.find(c=>c[0]==='team')[1],[1,2,3]);
});
test('late WS and GET revisions cannot rewind halos, immutable nomination or local pending clicks',async()=>{
  const f=roomFixture(),p=f.page(),old=plain(f.draft);[1,2,3].forEach(id=>select(p,id));await p.nominateTeam();[4,5,6].forEach(id=>select(p,id));await p.teamSync.flush();
  p.handleRoomEvent({roomId:90,type:'TEAM_DRAFT_UPDATED',teamDraft:old});p.setData(p.gameStateUpdate({...f.game,teamDraft:old}));p.decoratePlayers();
  assert.deepEqual(plain(p.data.selectedIds),[4,5,6]);assert.equal(p.data.nominatedText,'1 · 2 · 3');
});
test('reconnected/new page recovers nomination and final draft; newer proposal cancels pending work',async()=>{
  const f=roomFixture(),p=f.page();[1,2,3].forEach(id=>select(p,id));await p.nominateTeam();select(p,4);await p.teamSync.flush();const reopened=f.page(2);
  assert.equal(reopened.data.nominatedText,'1 · 2 · 3');assert.deepEqual(reopened.data.selectedIds,[2,3,4]);
  const old=p.teamSync,newGame={...f.game,proposalNo:2,leaderPlayerId:2};p.setData(p.gameStateUpdate({...newGame,teamDraft:sync.normalize(draft(newGame),newGame)}));p.decoratePlayers();
  assert.equal(old.closed,true);assert.equal(p.data.teamNominated,false);assert.deepEqual(plain(p.data.selectedIds),[]);assert.equal(p.data.isLeader,false);
});
test('unload cancels queued operations and late acknowledgement cannot update the page',async()=>{
  const f=roomFixture(),p=f.page(),gate=deferred();let requests=0;f.api.updateTeamDraft=async(id,r)=>{requests++;await gate.promise;return {...f.draft,selectedPlayerIds:r.playerIds,revision:1};};
  [1,2,3].forEach(id=>select(p,id));const old=p.teamSync;p.onUnload();const before=plain(p.data);gate.resolve();await old.promise;assert.equal(requests,1);assert.deepEqual(plain(p.data),before);
});
test('public normalization drops private fields and rejects wrong scope, duplicate IDs and oversized drafts',()=>{
  const g=game();const good={...draft(g),roleCode:'MERLIN',personalGuesses:{2:'ASSASSIN'},visiblePlayers:[2]};const normalized=sync.normalize(good,g);
  assert.ok(normalized);for(const key of ['roleCode','personalGuesses','visiblePlayers'])assert.equal(key in normalized,false);
  for(const patch of [{gameId:91},{missionNo:2},{proposalNo:2},{leaderPlayerId:2},{revision:-1},{selectedPlayerIds:[1,1]},{selectedPlayerIds:[1,2,3,4]},{nominated:true,nominatedPlayerIds:[1]}])assert.equal(sync.normalize({...good,...patch},g),null);
});
test('nominated central branch contains only first nomination, with shared rejection cues and no card background',()=>{
  const w=fs.readFileSync(path.join(root,'pages/room/room.wxml'),'utf8');const nominated=w.match(/<view wx:if="{{teamNominated}}"[^>]*>([^<]+)<\/view>/)[1];assert.equal(nominated,'队长已提名：{{nominatedText}}');
  assert.match(w,/teamDraftSupported && !teamNominated/);assert.match(w,/bindtap="nominateTeam"/);assert.match(w,/bindtap="submitTeam"/);assert.match(w,/rejection\.dots/);assert.doesNotMatch(w,/队长正在调整人选|card board-center/);
});

test('a newer other-device WS version wins over late HTTP acknowledgement and prevents dispatch',async()=>{
  const f=roomFixture(),p=f.page(),gate=deferred();
  f.api.updateTeamDraft=async()=>gate.promise;select(p,1);
  const newer={...f.draft,selectedPlayerIds:[2,3,4],revision:2};f.setDraft(newer);
  gate.resolve({...f.draft,selectedPlayerIds:[1],revision:1});await assert.rejects(p.teamSync.flush());
  assert.deepEqual(p.teamSync.draft.selectedPlayerIds,[2,3,4]);assert.ok(p.data.teamSyncError);await p.submitTeam();assert.equal(f.calls.some(c=>c[0]==='team'),false);
});
test('timeout after commit can recover via authoritative WS without a duplicate draft or nomination',async()=>{
  const f=roomFixture(),p=f.page();f.api.updateTeamDraft=async()=>{throw Error('timeout');};select(p,1);await assert.rejects(p.teamSync.flush());
  f.setDraft({...f.draft,selectedPlayerIds:[1],revision:1});assert.equal(p.data.teamSyncError,'');assert.equal(p.data.teamSyncPending,false);assert.deepEqual(p.data.selectedIds,[1]);
});
test('scoped final dispatch API sends version while legacy payload stays unchanged',()=>{
  let options;const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'services/avalon.js'),'utf8'),{module,require:()=>({request:v=>{options=v;}})});
  const api=module.exports;api.submitTeam(90,[1,2]);assert.deepEqual(plain(options.data),{playerIds:[1,2]});
  api.submitTeam(90,[1,2],{missionNo:1,proposalNo:1,leaderPlayerId:1,expectedDraftRevision:8});assert.equal(options.data.expectedDraftRevision,8);
  api.updateTeamDraft(90,{playerIds:[1]});assert.equal(options.method,'PUT');assert.equal(options.showError,false);assert.equal(options.url,'/api/avalon/game/90/team-draft');
});

test('late taps or final actions after leaving cannot fall back to legacy writes',async()=>{
  const f=roomFixture(),p=f.page();[1,2,3].forEach(id=>select(p,id));await p.teamSync.flush();p.onUnload();const count=f.calls.length,ids=p.data.selectedIds.slice();
  select(p,4);await p.submitTeam();await p.nominateTeam();await p.dispatchTeam(false);
  assert.equal(f.calls.length,count);assert.deepEqual(p.data.selectedIds,ids);
});
