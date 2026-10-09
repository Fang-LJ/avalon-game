const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
function moduleAt(file,mocks={},globals={}) {
  const box={module:{exports:{}},require:name=>name in mocks?mocks[name]:require(path.resolve(root,path.dirname(file),name)),...globals};
  vm.runInNewContext(read(file),box,{filename:file});return box.module.exports;
}
function pageAt(file,mocks={},wx={}) {
  let page;
  moduleAt(file,mocks,{wx,Page:value=>{page=value;},setInterval:()=>1,clearInterval(){}});
  page.data=structuredClone(page.data);page.setData=value=>Object.assign(page.data,value);return page;
}
function intent() {
  const storage=new Map(),destinations=[];
  const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
    reLaunch:o=>destinations.push(o.url),redirectTo:o=>destinations.push(o.url),showToast(){}};
  return {storage,destinations,wx,invite:moduleAt('utils/invite.js',{}, {wx})};
}
function login(f,mock=false) {
  return pageAt('pages/login/login.js',{'../../utils/invite':f.invite,'../../services/auth':{isMockLogin:()=>mock}},f.wx);
}
function join(f,api={},auth={requireSession:()=>true}) {
  return pageAt('pages/join/join.js',{'../../utils/invite':f.invite,'../../services/avalon':api,'../../services/auth':auth},f.wx);
}

test('WAITING share uses the real six-digit code; playing/closed/malformed rooms share home only',()=>{
  const f=intent(),p=pageAt('pages/room/room.js',{'../../utils/invite':f.invite},f.wx);
  p.setData({room:{roomCode:'039839',maxPlayers:8,status:'WAITING'},game:null});
  const share=p.onShareAppMessage();assert.equal(share.path,'/pages/join/join?roomCode=039839');assert.match(share.title,/8 人局/);
  for(const status of ['PLAYING','FINISHED','CLOSED']){
    p.data.room.status=status;assert.equal(p.onShareAppMessage().path,'/pages/index/index');
  }
  p.data.room.status='WAITING';p.data.game={gameId:1};assert.equal(p.onShareAppMessage().path,'/pages/index/index');
  p.data.game=null;p.data.room.roomCode='123456&roomId=1';assert.equal(p.onShareAppMessage().path,'/pages/index/index');
  const markup=read('pages/room/room.wxml');assert.match(markup,/room.status === 'WAITING'[^>]*open-type="share"/);
  assert.match(markup,/copy-code-button[^>]*bindtap="copyCode"/);
});
test('Join query accepts six-digit strings only, saves before session checks and never auto-joins',()=>{
  const f=intent();let joins=0,checks=0;
  const p=join(f,{joinRoom:()=>{joins++;}},{requireSession:()=>{checks++;assert.equal(f.invite.get(),'000123');return false;}});
  p.onLoad({roomCode:'000123'});assert.equal(p.data.roomCode,'000123');assert.equal(p.data.valid,true);
  assert.equal(checks,0);p.onShow();assert.equal(checks,1);assert.equal(joins,0);
  for(const value of ['', '12345','1234567','abc123','123456&x=1',' 123456',123456,null,{}]){
    const q=join(intent());q.onLoad({roomCode:value});assert.equal(q.data.roomCode,'');assert.equal(q.data.valid,false);
  }
});
test('ordinary Join stays empty even if an older pending invite exists; redundant old UI is removed',()=>{
  const f=intent();f.invite.save('123456');const p=join(f);p.onLoad({});assert.equal(p.data.roomCode,'');
  const markup=read('pages/join/join.wxml'),css=read('pages/join/join.wxss');
  assert.doesNotMatch(markup+css,/464349|示例房间号|join-example|example-code|扫码|暂未开放/);
  assert.match(markup,/fromInvite \? '好友邀请你加入房间'/);
  assert.match(css,/margin-top: 48rpx/);assert.match(css,/margin-top: 44rpx/);
});
test('unauthenticated invitation survives login and complete or mock profiles route back to Join',()=>{
  for(const mock of [false,true]){
    const f=intent();const p=join(f,{}, {requireSession:()=>{f.wx.reLaunch({url:'/pages/login/login'});return false;}});
    p.onLoad({roomCode:'398398'});p.onShow();
    login(f,mock).goAfterLogin({profileComplete:mock?false:true});
    assert.deepEqual(f.destinations,['/pages/login/login','/pages/join/join?roomCode=398398']);
    assert.equal(f.invite.get(),'398398');
  }
});
test('profile is prioritized over invite; first save restores it exactly once, not home',async()=>{
  const f=intent();f.invite.save('398398');login(f).goAfterLogin({profileComplete:false});
  assert.equal(f.destinations.at(-1),'/pages/profile/profile');assert.equal(f.invite.get(),'398398');
  let updates=0;
  const p=pageAt('pages/profile/profile.js',{'../../utils/invite':f.invite,
    '../../services/avalon':{updateProfile:async()=>{updates++;}}},f.wx);
  p.setData({nickname:'玩家',avatarUrl:'https://images.invalid/a.png'});p.syncCanSave();await p.save();await p.save();
  assert.equal(updates,1);assert.equal(f.destinations.at(-1),'/pages/join/join?roomCode=398398');
  assert.equal(f.invite.get(),'398398');
  assert.doesNotMatch(read('pages/profile/profile.wxml'),/跳过/,'existing required profile has no skip entry; do not add a bypass');
});
test('editing profile keeps navigateBack and does not hijack it with an invite',async()=>{
  const f=intent();f.invite.save('398398');let back=0;f.wx.navigateBack=()=>back++;
  const p=pageAt('pages/profile/profile.js',{'../../utils/invite':f.invite,'../../services/avalon':{updateProfile:async()=>{}}},f.wx);
  p.setData({mode:'edit',nickname:'玩家',avatarUrl:'https://images.invalid/a.png'});p.syncCanSave();await p.save();
  assert.equal(back,1);assert.equal(f.invite.get(),'398398');assert.equal(f.destinations.length,0);
});
test('successful join clears intent before redirect; manual input uses the new room, not old query',async()=>{
  const f=intent();let sent;
  f.wx.redirectTo=({url})=>{assert.equal(f.invite.get(),'');f.destinations.push(url);};
  const p=join(f,{joinRoom:async data=>{sent=data;return {roomId:8};}});
  p.onLoad({roomCode:'398398'});p.codeInput({detail:{value:'123456'}});await p.submit();
  assert.equal(sent.roomCode,'123456');assert.deepEqual(f.destinations,['/pages/room/room?roomId=8']);
  assert.equal(f.storage.has(f.invite.KEY),false);
});
test('failed join retains current intent and offers editing, invalid input never calls API',async()=>{
  const f=intent();let calls=0;
  const p=join(f,{joinRoom:async()=>{calls++;throw new Error('房间已满');}});p.onLoad({roomCode:'398398'});await p.submit();
  assert.equal(f.invite.get(),'398398');assert.equal(p.data.error,'房间已满');assert.equal(p.data.loading,false);
  p.editCode();assert.equal(p.data.valid,false);await p.submit();assert.equal(calls,1);
  assert.equal(f.invite.get(),'398398');
});
test('late join success does not clear a newer invitation',async()=>{
  const f=intent(),post=deferred(),p=join(f,{joinRoom:()=>post.promise});
  p.onLoad({roomCode:'398398'});const operation=p.submit();f.invite.save('222222');post.resolve({roomId:8});await operation;
  assert.equal(f.invite.get(),'222222');
});
test('invalid stored invites are ignored and storage failures retain intent within the app',()=>{
  const f=intent();f.storage.set(f.invite.KEY,'123456&x=1');assert.equal(f.invite.destinationOrHome(),'/pages/index/index');
  const wx={getStorageSync(){throw Error('storage');},setStorageSync(){throw Error('storage');},removeStorageSync(){throw Error('storage');}};
  const invite=moduleAt('utils/invite.js',{}, {wx});assert.equal(invite.save('000123'),true);assert.equal(invite.get(),'000123');
  invite.clear();assert.equal(invite.get(),'');
  const quota=moduleAt('utils/invite.js',{}, {wx:{getStorageSync:()=> '111111',setStorageSync(){throw Error('quota');},removeStorageSync(){throw Error('quota');}}});
  quota.save('222222');assert.equal(quota.get(),'222222');quota.clear();assert.equal(quota.get(),'');
});
test('candidate is purple/white with subtle glow, distinct from gold crown/blue selection; red moon unchanged',()=>{
  const css=read('components/knowledge-mark/knowledge-mark.wxss'),candidate=css.match(/\.candidate-mark \{([^}]+)\}/)[1];
  assert.match(candidate,/background: #b69cff/);assert.match(candidate,/color: #ffffff/);assert.match(candidate,/rgba\(182,156,255,\.35\)/);
  assert.doesNotMatch(candidate,/gold|d8b25c|55c8ff|animation/i);assert.match(css,/evil-crescent/);assert.match(css,/#e47a86/);
  for(const file of ['components/player-seat/player-seat.wxss','components/card-deal-stage/card-deal-stage.wxss','pages/room/room.wxss']){
    const rules=read(file).match(/\.knowledge-(?:inline\.)?candidate \{([^}]+)\}/g)||[];
    assert.ok(rules.every(rule=>!rule.includes('gold')&&!rule.includes('d8b25c')));
  }
  const seat=read('components/player-seat/player-seat.wxml');
  for(const marker of ['leader-icon','knowledge-icon','action-done-icon','player.selectionClass'])assert.ok(seat.includes(marker));
  assert.match(read('components/player-seat/player-seat.wxss'),/\.leader-icon \{[^}]+background: var\(--gold\)/);
});

const players=Array.from({length:7},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:`玩家${i+1}`,me:i===0}));
const room={roomId:7,currentGameId:9,status:'PLAYING',roomCode:'398398',myPlayerId:1,maxPlayers:7,players};
const role={roleCode:'PERCIVAL',visiblePlayers:[{playerId:2,knowledgeType:'MERLIN_OR_MORGANA'},{playerId:5,knowledgeType:'MERLIN_OR_MORGANA'}]};
const state={gameId:9,roomId:7,phase:'TEAM_VOTING',missionNo:1,proposalNo:1,leaderPlayerId:2,selectedPlayerIds:[1,2],hasVoted:false,votedPlayerIds:[2],hasSubmittedMission:false,missionSubmittedPlayerIds:[],onMission:true};
function roomPage(api={}) {
  const p=pageAt('pages/room/room.js',{'../../services/avalon':api,'../../utils/socket':{}},{getStorageSync:()=>0,showToast(){},reLaunch(){}});
  p.active=true;p.setData({roomId:7,room:structuredClone(room),game:structuredClone(state),role:structuredClone(role),draftKey:'9-1-1-TEAM_VOTING',selectedIds:[1,2]});
  p.decoratePlayers();return p;
}
test('vote consumes confirmed response immediately; old refresh and socket bursts cannot remove own tick',async()=>{
  const old=deferred(),fresh=deferred(),post=deferred();let reads=0,votes=0;
  const newer={...state,hasVoted:true,votedPlayerIds:[1,2,3]};
  const p=roomPage({room:async()=>room,game:()=>++reads===1?old.promise:fresh.promise,
    timeline:async()=>({missions:[],proposals:[]}),myRole:async()=>role,
    vote:(id,choice)=>{votes++;assert.equal(id,9);assert.equal(choice,'REJECT');return post.promise;}});
  const changes=[];const set=p.setData;p.setData=values=>{set(values);if(values.displayPlayers)changes.push(values.displayPlayers.find(v=>v.me).actionDone);};
  const a=p.refresh();await flush();assert.equal(reads,1);
  const mutation=p.reject();assert.equal(votes,1);assert.equal(p.data.busy,true);assert.equal(p.data.displayPlayers[0].actionDone,false);
  for(let i=0;i<12;i++)p.handleRoomEvent({type:'VOTE_COMPLETED',roomId:7});
  post.resolve(newer);await flush();assert.equal(p.data.game.hasVoted,true);assert.equal(p.data.displayPlayers[0].actionDone,true);
  assert.equal(p.data.busy,true,'fresh fetch not finished yet');
  old.resolve({...state});await a;await flush();
  assert.equal(p.data.game.hasVoted,true,'stale A must not undo returned state');assert.equal(reads,2,'fresh B required after mutation');
  fresh.resolve({...newer,votedPlayerIds:[1,2,3,4]});await mutation;await flush();
  assert.equal(p.data.busy,false);assert.equal(p.data.displayPlayers[0].actionDone,true);
  assert.equal(changes.slice(changes.indexOf(true)).includes(false),false,'own tick never flickers off');
  assert.equal(p.data.displayPlayers.filter(v=>v.actionDone).length,4);assert.equal(reads,2,'socket burst coalesced');
  assert.match(read('pages/room/room.wxml'),/已投票，等待其他玩家/);
});
test('failed vote produces no optimistic tick and busy unlocks for retry',async()=>{
  const post=deferred(),p=roomPage({vote:()=>post.promise});let refreshes=0;p.refresh=async()=>refreshes++;
  const operation=p.approve();assert.equal(p.data.displayPlayers[0].actionDone,false);post.reject(new Error('network'));await operation;
  assert.equal(p.data.displayPlayers[0].actionDone,false);assert.equal(p.data.game.hasVoted,false);assert.equal(p.data.busy,false);assert.equal(refreshes,0);
});
test('last vote transitions phase and task controls correctly then refreshes all auxiliary data',async()=>{
  const mission={...state,phase:'MISSION_EXECUTING',hasVoted:true,votedPlayerIds:[]};let reads=0;
  const p=roomPage({vote:async()=>mission,room:async()=>room,game:async()=>{reads++;return mission;},timeline:async()=>({missions:[],proposals:[]}),myRole:async()=>role});
  await p.approve();assert.equal(p.data.game.phase,'MISSION_EXECUTING');assert.equal(p.data.phaseTitle,'秘密任务');
  assert.equal(p.data.displayPlayers[0].actionDone,false);assert.equal(p.data.missionOverlayOpen,true);assert.equal(reads,1);
});
test('mission applies confirmed own tick and closes chooser immediately while fresh GET is pending',async()=>{
  const post=deferred(),fresh=deferred();const submitted={...state,phase:'MISSION_EXECUTING',hasSubmittedMission:true,missionSubmittedPlayerIds:[1],votedPlayerIds:[]};
  const p=roomPage({mission:()=>post.promise,room:async()=>room,game:()=>fresh.promise,timeline:async()=>({missions:[],proposals:[]}),myRole:async()=>role});
  p.setData({game:{...submitted,hasSubmittedMission:false,missionSubmittedPlayerIds:[]},draftKey:'9-1-1-MISSION_EXECUTING',missionOverlayOpen:true,missionChoice:'SUCCESS'});p.decoratePlayers();
  const operation=p.submitMission();await flush();assert.equal(p.data.displayPlayers[0].actionDone,false);
  post.resolve(submitted);await flush();assert.equal(p.data.displayPlayers[0].actionDone,true);assert.equal(p.data.missionOverlayOpen,false);
  assert.equal(p.data.game.hasSubmittedMission,true);assert.equal(p.data.busy,true);
  fresh.resolve(submitted);await operation;assert.equal(p.data.busy,false);
});
test('last mission response advances and reuses the authoritative result reveal, not stale task ticks',async()=>{
  const result={...state,phase:'TEAM_BUILDING',missionNo:2,proposalNo:1,hasSubmittedMission:false,selectedPlayerIds:[],votedPlayerIds:[],missionSubmittedPlayerIds:[],latestMissionResult:{missionNo:1,successCount:2,failCount:0,status:'SUCCESS'}};
  const p=roomPage({mission:async()=>result,room:async()=>room,game:async()=>result,timeline:async()=>({missions:[result.latestMissionResult],proposals:[]}),myRole:async()=>role});
  p.setData({game:{...state,phase:'MISSION_EXECUTING'},draftKey:'9-1-1-MISSION_EXECUTING',missionChoice:'SUCCESS',missionOverlayOpen:true});
  await p.submitMission();assert.equal(p.data.game.missionNo,2);assert.equal(p.data.missionResultOpen,true);
  assert.equal(p.data.missionResult.missionNo,1);assert.equal(p.data.missionOverlayOpen,false);assert.ok(p.data.displayPlayers.every(v=>!v.actionDone));
});
test('stale pre-mutation GET errors cannot kick out a player after confirmed vote; fresh request still runs',async()=>{
  const old=deferred(),post=deferred();let calls=0,kicked=0;
  const newer={...state,hasVoted:true,votedPlayerIds:[1,2]};
  const p=roomPage({vote:()=>post.promise,room:()=>++calls===1?old.promise:Promise.resolve(room),game:async()=>newer,timeline:async()=>({missions:[],proposals:[]}),myRole:async()=>role});
  p.exitClosedRoom=()=>kicked++;const a=p.refresh();const mutation=p.approve();post.resolve(newer);await flush();
  old.reject(Object.assign(new Error('old missing'),{code:'NOT_FOUND'}));await a;await mutation;
  assert.equal(kicked,0);assert.equal(calls,2);assert.equal(p.data.error,'');assert.equal(p.data.game.hasVoted,true);
});
test('late mutation cannot replace a rematch, hidden page or more advanced bot phase',()=>{
  const context={roomId:7,gameId:9},p=roomPage();
  p.data.game={...state,phase:'MISSION_EXECUTING'};
  assert.equal(p.applyGameMutationResult({...state,hasVoted:true},context),false);assert.equal(p.data.game.phase,'MISSION_EXECUTING');
  p.data.game={...state,missionNo:2};assert.equal(p.applyGameMutationResult({...state,hasVoted:true},context),false);
  p.data.game={...state,gameId:10};assert.equal(p.applyGameMutationResult({...state,hasVoted:true},context),false);
  p.data.game={...state};p.data.roomId=8;assert.equal(p.applyGameMutationResult({...state,hasVoted:true},context),false);
  p.data.roomId=7;p.active=false;assert.equal(p.applyGameMutationResult({...state,hasVoted:true},context),false);
});
test('confirmed POST preserves newer bot completion ticks only within same proposal, no public-player mutation',()=>{
  const p=roomPage();p.data.game={...state,votedPlayerIds:[2,3,4]};
  p.applyGameMutationResult({...state,hasVoted:true,votedPlayerIds:[1,2]}, {roomId:7,gameId:9});
  assert.deepEqual(plain(p.data.game.votedPlayerIds),[1,2,3,4]);assert.ok(p.data.displayPlayers[0].actionDone);
  assert.ok(p.data.room.players.every(v=>!('actionDone' in v)&&!('knowledgeType' in v)));
  p.applyGameMutationResult({...state,proposalNo:2,hasVoted:false,votedPlayerIds:[]},{roomId:7,gameId:9});
  assert.equal(p.data.game.hasVoted,false);assert.equal(p.data.displayPlayers[0].actionDone,false);
});
test('room-shaped responses are never applied as GameState, general run/restart remain separate',()=>{
  const p=roomPage(),before=p.data.game;assert.equal(p.applyGameMutationResult({...room},{roomId:7,gameId:9}),false);
  assert.equal(p.data.game,before);assert.match(read('pages/room/room.js'),/return this.run\(\(\) => api.restart/);
});
