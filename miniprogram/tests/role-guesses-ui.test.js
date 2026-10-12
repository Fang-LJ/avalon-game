const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const d = require('../utils/role-guesses');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
function fixture(role='MERLIN', n=7, visible=[{playerId:2,knowledgeType:'EVIL'}], storage=new Map()) {
  let page; const calls=[], writes=[], toast=[], vibration=[];
  const room = {roomId:91,currentGameId:42,status:'PLAYING',maxPlayers:n,myPlayerId:1,
    players:Array.from({length:n},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:`玩家${i+1}`,me:i===0,seated:true}))};
  const game = {gameId:42,phase:'TEAM_BUILDING',leaderPlayerId:1,missionNo:1,proposalNo:1,requiredTeamSize:2,selectedPlayerIds:[]};
  const privateRole = {roleCode:role,visiblePlayers:visible};
  const timeline = {missions:[],proposals:[]};
  const api = new Proxy({room:async()=>room,game:async()=>game,myRole:async()=>privateRole,timeline:async()=>timeline}, {
    get(target,key) { if (key in target) return target[key]; return async (...args)=>{calls.push([key,...args]);}; }
  });
  const wx = {getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>{writes.push([k,plain(v)]);storage.set(k,plain(v));},
    removeStorageSync:k=>{writes.push([k,null]);storage.delete(k);},showToast:o=>toast.push(o.title),
    vibrateShort:o=>vibration.push(o),vibrateLong:o=>vibration.push(o)};
  vm.runInNewContext(read('pages/room/room.js'),{Page:v=>{page=v;},wx,clearInterval(){},
    require:name=>name==='../../services/avalon'?api:/services\/auth|utils\/socket/.test(name)?{}:require(path.resolve(root,'pages/room',name))});
  page.data=structuredClone(page.data); page.setData=v=>Object.assign(page.data,v); page.active=true;
  page.setData({roomId:91,room,role:privateRole,game,isLeader:true});page.decoratePlayers();
  return {page,room,game,privateRole,timeline,api,wx,storage,calls,writes,toast,vibration};
}
function open(f,id=2) {f.page.openRoleGuess({detail:{playerId:id}});return f.page.data.roleGuessSheet;}
function choose(f,roleCode,id=2) {const sheet=open(f,id);assert.ok(sheet);f.page.chooseRoleGuess({detail:{scope:sheet.scope,playerId:id,roleCode}});}
function clear(f,id=2) {const sheet=open(f,id);assert.ok(sheet);f.page.clearRoleGuess({detail:{scope:sheet.scope,playerId:id}});}
const display = (f,id) => f.page.data.displayPlayers.find(p=>p.playerId===id);

test('private guess replaces moon in existing badge, clearing restores moon and never mutates public DTOs',()=>{
  const f=fixture();const before=plain({room:f.room,game:f.game,timeline:f.timeline,role:f.privateRole});
  assert.equal(display(f,2).markType,'EVIL');
  choose(f,'OBERON');assert.equal(display(f,2).markType,'GUESS');assert.equal(display(f,2).markText,'奥');
  assert.equal(f.page.data.roleGuessSheet,null);
  assert.deepEqual(f.storage.get(d.storageKey(42,1)),{guesses:{2:'OBERON'}});
  assert.deepEqual(plain({room:f.room,game:f.game,timeline:f.timeline,role:f.privateRole}),before);
  assert.deepEqual(f.calls,[]);assert.equal(f.vibration.length,0);
  clear(f);assert.equal(display(f,2).markType,'EVIL');assert.equal(f.storage.has(d.storageKey(42,1)),false);
});
test('flat options contain only available roles and reediting releases current capacity',()=>{
  const f=fixture('ASSASSIN',7,[{playerId:2,knowledgeType:'EVIL_ALLY',roleCode:'MORGANA'}]);
  choose(f,'OBERON',3);
  const sheet=open(f,4);
  assert.deepEqual(plain(sheet.options.map(p=>p.roleCode)),['MERLIN','PERCIVAL','LOYAL_SERVANT']);
  assert.ok(sheet.options.every(p=>p.tone==='good'));
  f.page.closeRoleGuess({detail:{scope:sheet.scope}});
  assert.ok(open(f,3).options.some(p=>p.roleCode==='OBERON' && p.tone==='evil'));
  clear(f,3);assert.ok(open(f,4).options.some(p=>p.roleCode==='OBERON' && p.tone==='evil'));
});
test('Percival atomic pair storage, swapping and clearing restore both identical question marks',()=>{
  const f=fixture('PERCIVAL',7,[2,3].map(playerId=>({playerId,knowledgeType:'MERLIN_OR_MORGANA'})));
  assert.deepEqual([display(f,2).markType,display(f,3).markType],['MERLIN_OR_MORGANA','MERLIN_OR_MORGANA']);
  choose(f,'MERLIN',2);assert.deepEqual(f.storage.get(d.storageKey(42,1)),{guesses:{2:'MERLIN',3:'MORGANA'}});
  assert.equal(f.writes.length,1);assert.equal(display(f,2).markText,'梅');assert.equal(display(f,3).markText,'娜');
  choose(f,'MERLIN',3);assert.equal(display(f,2).markText,'娜');assert.equal(display(f,3).markText,'梅');
  clear(f,3);assert.equal(display(f,2).markType,'MERLIN_OR_MORGANA');assert.equal(display(f,3).markType,'MERLIN_OR_MORGANA');
  assert.deepEqual(f.calls,[]);
});
test('self and exact known teammate cannot open guessing sheet or override system letter',()=>{
  const f=fixture('ASSASSIN',7,[{playerId:2,knowledgeType:'EVIL_ALLY',roleCode:'MORGANA'}]);
  for(const id of [1,2]) assert.equal(open(f,id),null);
  assert.equal(display(f,2).markText,'娜');assert.equal(f.vibration.length,0);assert.equal(f.writes.length,0);
});
test('close sheet is a no-op on stored notes and canceled sheet cannot apply stale selection',()=>{
  const f=fixture();choose(f,'OBERON');const first=open(f);
  f.page.closeRoleGuess({detail:{scope:first.scope}});const second=open(f);
  f.page.chooseRoleGuess({detail:{scope:first.scope,playerId:2,roleCode:'ASSASSIN'}});
  f.page.closeRoleGuess({detail:{scope:first.scope}});
  assert.equal(f.page.data.roleGuessSheet.scope,second.scope);assert.equal(display(f,2).markText,'奥');
  assert.equal(f.writes.length,1);
});
for(const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE']) test(`${phase}: sheet saves while existing selection and state stay intact`,()=>{
  const f=fixture();f.game.phase=phase;f.page.data.selectedIds=[2];
  f.page.decoratePlayers();const before=JSON.stringify(f.game);
  choose(f,'MORGANA');assert.equal(display(f,2).markText,'娜');assert.equal(display(f,2).selected,true);
  assert.deepEqual(f.page.data.selectedIds,[2]);assert.equal(JSON.stringify(f.game),before);assert.deepEqual(f.calls,[]);
});
for(const phase of ['WAITING','ROLE_CONFIRM','ASSASSINATION','FINISHED']) test(`${phase}: no sheet and no guess display`,()=>{
  const f=fixture();choose(f,'OBERON');f.game.phase=phase;f.page.decoratePlayers();
  assert.equal(open(f),null);assert.equal(f.page.data.canGuessRoles,false);
  assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false);
});
for(const field of ['busy','roleOverlay','missionOverlayOpen','missionResultOpen','missionDetail','ladyResult']) test(`${field}: prevents overlapping private sheet`,()=>{
  const f=fixture();f.page.data[field]=true;assert.equal(open(f),null);assert.equal(f.vibration.length,0);
});
for(const phase of ['ASSASSINATION','FINISHED']) test(`${phase}: clears memory, storage and sheet even when deletion throws`,()=>{
  const f=fixture();choose(f,'OBERON');open(f);
  f.wx.removeStorageSync=()=>{throw new Error('unavailable');};
  f.page.setData(f.page.gameStateUpdate({...f.game,phase}));f.page.decoratePlayers();
  assert.deepEqual(plain(f.page.data.personalGuesses),{});assert.equal(f.page.data.roleGuessSheet,null);
  assert.ok(f.storage.has(d.storageKey(42,1))); // Independent rendering gate is essential.
  assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false);
  f.game.phase='TEAM_BUILDING';f.page.setData({game:f.game});f.page.decoratePlayers();
  assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false); // Stale response cannot resurrect notes.
});
test('phase response clears immediately before slow timeline/my-role resolve',async()=>{
  const f=fixture();choose(f,'OBERON');open(f);
  let finishRole;f.api.myRole=()=>new Promise(resolve=>{finishRole=resolve;});
  f.api.game=async()=>({...f.game,phase:'ASSASSINATION'});
  const pending=f.page.fetchState();await new Promise(setImmediate);
  assert.equal(f.storage.has(d.storageKey(42,1)),false);assert.equal(f.page.data.roleGuessSheet,null);
  assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false);
  finishRole(f.privateRole);await pending;assert.equal(f.page.data.game.phase,'ASSASSINATION');
});
test('assassination keeps exact evil red rings and selected amber target without guess badge',()=>{
  const f=fixture();choose(f,'OBERON');
  const game={...f.game,phase:'ASSASSINATION',revealedEvilIdentities:[{playerId:2,roleCode:'OBERON'},{playerId:3,roleCode:'MORGANA'}],
    assassinationTarget:{playerId:4,seatNo:4,nickname:'玩家4'},assassinationTargetRevision:1};
  f.page.setData(f.page.gameStateUpdate(game));f.page.decoratePlayers();
  assert.equal(display(f,2).revealedEvil,true);assert.equal(display(f,2).markType,'ROLE');assert.equal(display(f,2).markText,'奥');
  assert.equal(display(f,4).selectionClass,'selected-assassination');
  assert.equal(f.storage.has(d.storageKey(42,1)),false);
});
test('normal websocket refresh retains guesses; reopening same game loads storage',async()=>{
  const f=fixture();choose(f,'OBERON');f.page.handleRoomEvent({roomId:91,type:'TEAM_VOTE_SUBMITTED'});await f.page.refreshing;
  assert.equal(display(f,2).markText,'奥');assert.equal(f.page.data.personalGuesses[2],'OBERON');
  const again=fixture('MERLIN',7,[{playerId:2,knowledgeType:'EVIL'}],f.storage);
  assert.equal(display(again,2).markText,'奥');assert.deepEqual(f.calls,[]);
});
test('another game or current gamePlayerId never inherits previous notes',()=>{
  const f=fixture();choose(f,'OBERON');open(f);f.game.gameId=43;f.page.decoratePlayers();
  assert.deepEqual(plain(f.page.data.personalGuesses),{});assert.equal(f.page.data.roleGuessSheet,null);
  f.game.gameId=42;f.room.myPlayerId=3;f.privateRole.roleCode='LOYAL_SERVANT';f.page.decoratePlayers();
  assert.deepEqual(plain(f.page.data.personalGuesses),{});assert.equal(display(f,2).markType==='GUESS',false);
});
test('rematch WAITING lobby never displays old note or deduction sheet',async()=>{
  const f=fixture();choose(f,'OBERON');open(f);f.room.currentGameId=null;f.room.status='WAITING';
  await f.page.fetchState();assert.equal(f.page.data.game,null);assert.equal(f.page.data.roleGuessSheet,null);
  assert.equal(f.page.data.canGuessRoles,false);assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false);
});
for(const change of ['phase','gameId','myPlayerId','busy','inactive']) test(`late sheet event is rejected after ${change} changes`,()=>{
  const f=fixture();const sheet=open(f);const detail={scope:sheet.scope,playerId:2,roleCode:'OBERON'};
  if(change==='phase')f.game.phase='ASSASSINATION';
  if(change==='gameId')f.game.gameId=43;
  if(change==='myPlayerId')f.room.myPlayerId=3;
  if(change==='busy')f.page.data.busy=true;
  if(change==='inactive')f.page.active=false;
  f.page.chooseRoleGuess({detail});assert.equal(f.writes.length,0);assert.deepEqual(plain(f.page.data.personalGuesses),{});
});
test('storage write failure keeps previous badge, pair stays atomic and reports failure',()=>{
  const f=fixture();choose(f,'OBERON');f.wx.setStorageSync=()=>{throw new Error('full');};choose(f,'ASSASSIN');
  assert.equal(display(f,2).markText,'奥');assert.equal(f.storage.get(d.storageKey(42,1)).guesses[2],'OBERON');
  assert.equal(f.toast.at(-1),'个人推测无法保存，请重试');assert.ok(f.page.data.roleGuessSheet);
});

function component(file,data) {
  let definition;vm.runInNewContext(read(file),{Component:v=>{definition=v;}});
  const events=[];return {...definition.methods,data,events,triggerEvent:(type,detail)=>events.push({type,detail:plain(detail)})};
}
test('longpress consumes all taps from same gesture, next independent quick gesture still selects',()=>{
  const seat=component('components/player-seat/player-seat.js',{player:{playerId:2,seatNo:2},guessEnabled:true});
  seat.beginTouch();seat.longPress();seat.choose();seat.choose();
  assert.deepEqual(seat.events,[{type:'guess',detail:{playerId:2,seatNo:2}}]);
  seat.beginTouch();seat.choose();assert.equal(seat.events.at(-1).type,'select');
});
test('longpress on self or disabled-phase avatar cannot trigger ghost team/Lady/assassination tap',()=>{
  for(const data of [{player:{playerId:1,me:true},guessEnabled:true},{player:{playerId:2},guessEnabled:false},{player:{empty:true},guessEnabled:true}]) {
    const seat=component('components/player-seat/player-seat.js',data);seat.beginTouch();seat.longPress();seat.choose();assert.deepEqual(seat.events,[]);
    seat.beginTouch();seat.choose();assert.equal(seat.events.at(-1).type,'select');
  }
});
test('ordinary quick tap still invokes original selection gate and never guesses',()=>{
  for(const blocked of [false,true]) {
    const seat=component('components/player-seat/player-seat.js',{player:{playerId:2,disabled:blocked},guessEnabled:true});
    seat.beginTouch();seat.choose();assert.equal(seat.events.length,blocked?0:1);
    if(!blocked)assert.equal(seat.events[0].type,'select');
  }
});
test('custom deduction sheet emits only available role choice, scoped clear and close',()=>{
  const sheet={scope:'42:1:5',playerId:2,currentRole:'MERLIN',options:[{roleCode:'MERLIN',tone:'good'}]};
  const cmp=component('components/role-guess-sheet/role-guess-sheet.js',{sheet});
  cmp.choose({currentTarget:{dataset:{roleCode:'ASSASSIN'}}});assert.equal(cmp.events.length,0);
  cmp.choose({currentTarget:{dataset:{roleCode:'MERLIN'}}});cmp.clear();cmp.close();
  assert.deepEqual(cmp.events,[{type:'choose',detail:{scope:sheet.scope,playerId:2,roleCode:'MERLIN'}},
    {type:'clear',detail:{scope:sheet.scope,playerId:2}},{type:'close',detail:{scope:sheet.scope}}]);
});
test('one existing identity badge, custom private sheet, shared role style and no network dependency',()=>{
  const player=read('components/player-seat/player-seat.wxml');
  assert.equal((player.match(/class="seat-badge knowledge-icon /g)||[]).length,1);
  assert.match(player,/bindlongpress="longPress"/);assert.match(player,/bindtouchstart="beginTouch"/);
  const sheet=read('components/role-guess-sheet/role-guess-sheet.wxml');
  assert.match(sheet,/>标注身份<\/view>/);assert.match(sheet,/再次点击已选身份即可取消标注/);assert.match(sheet,/currentRole/);
  assert.doesNotMatch(sheet,/sheet\.(?:nickname|seatNo)|推测|仅自己可见|不是系统身份|当前判断|正义阵营|邪恶阵营|长按头像编辑|guess-close|guess-clear|scroll-view/);
  assert.doesNotMatch(read('components/role-guess-sheet/role-guess-sheet.js'),/showActionSheet|request|socket/);
  assert.doesNotMatch(read('utils/role-guesses.js'),/require\([^)]*(services|request|socket)/);
  assert.match(read('components/knowledge-mark/knowledge-mark.wxml'),/class="knowledge-mark role-mark role-\{\{tone\}\} guess-role-mark"/);
  const room=read('pages/room/room.wxml');assert.match(room,/roleGuessSheet && canGuessRoles/);
  assert.ok(!fs.readFileSync(path.join(root,'services/avalon.js'),'utf8').includes('personalGuesses'));
});

test('GUESS role body and independent question belong only to the GUESS branch',()=>{
  const markup=read('components/knowledge-mark/knowledge-mark.wxml');
  const guess=markup.match(/^<view wx:if="\{\{markType === 'GUESS'\}\}"[^>]*>([\s\S]*?)<\/view>/);
  assert.ok(guess);
  assert.match(guess[1],/<text class="guess-role-text">\{\{text\}\}<\/text>/);
  assert.match(guess[1],/<text class="guess-question">\?<\/text>/);
  assert.equal((markup.match(/class="guess-question"/g)||[]).length,1);
  // Exact identities and the full-size purple ambiguity badge are unchanged.
  assert.match(markup,/<view wx:elif="\{\{markType === 'ROLE'\}\}" class="knowledge-mark role-mark role-\{\{tone\}\}">\{\{text\}\}<\/view>/);
  assert.match(markup,/class="knowledge-mark candidate-mark">\?<\/view>/);
  assert.doesNotMatch(markup,/guess-\{\{tone\}\}|replace\(/);
});
test('system role sizes typography colors and candidate badge remain unchanged',()=>{
  const css=read('components/knowledge-mark/knowledge-mark.wxss');
  const original={
    'role-mark':'border: 1rpx solid; font-size: 22rpx; font-weight: 900; line-height: 1;',
    'role-evil':'background: #6f2833; border-color: #c86472; color: #fff2f2;',
    'role-loyal':'background: #255c62; border-color: #66c5c6; color: #dcffff;',
    'role-merlin':'background: #594a22; border-color: #e2bf62; color: #f5dc91;',
    'role-percival':'background: #493a69; border-color: #b69cff; color: #f1eaff;',
    'candidate-mark':'background: #b69cff; color: #ffffff; font-size: 24rpx; font-weight: 900; line-height: 1; box-shadow: 0 0 10rpx rgba(182,156,255,.35);',
  };
  for(const [name,body] of Object.entries(original)) {
    assert.equal(css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))[1].trim(),body);
  }
  assert.doesNotMatch(css,/\.guess-(?:mark|evil|loyal|percival)\s*\{/);
  assert.doesNotMatch(css,/\.guess-role-text\s*\{/); // Inherit exact role typography, no smaller overrides.
});
test('external question is 16rpx at upper right without its own circle or background',()=>{
  const css=read('components/knowledge-mark/knowledge-mark.wxss');
  assert.equal(css.match(/\.guess-role-mark \{([^}]+)\}/)[1].trim(),'position: relative; overflow: visible;');
  const question=css.match(/\.guess-question \{([^}]+)\}/)[1];
  for(const declaration of ['position: absolute','right: -7rpx','top: -8rpx','font-size: 16rpx','font-weight: 900','color: #f1ddb2'])
    assert.ok(question.includes(declaration));
  assert.doesNotMatch(question,/(?:^|;)\s*(?:background(?:-[\w-]+)?|border(?:-[\w-]+)?|width|height)\s*:/);
});
test('opening updating swapping clearing and closing a deduction sheet never trigger vibration',()=>{
  const f=fixture('PERCIVAL',7,[2,3].map(playerId=>({playerId,knowledgeType:'MERLIN_OR_MORGANA'})));
  choose(f,'MERLIN',2);choose(f,'MERLIN',3);clear(f,2);
  const sheet=open(f,2);f.page.closeRoleGuess({detail:{scope:sheet.scope}});
  assert.equal(f.vibration.length,0);
  assert.doesNotMatch(read('pages/room/room.js'),/vibrateShort|vibrateLong/);
});
test('longpress sheet works without any vibration API in the environment',()=>{
  const f=fixture();delete f.wx.vibrateShort;delete f.wx.vibrateLong;
  assert.ok(open(f));assert.equal(f.page.data.roleGuessSheet.playerId,2);
  assert.equal(f.vibration.length,0);
});

test('centered auto-height modal uses a single two-column grid and alignment-colored selected buttons',()=>{
  const markup=read('components/role-guess-sheet/role-guess-sheet.wxml');
  const css=read('components/role-guess-sheet/role-guess-sheet.wxss');
  assert.match(css,/align-items: center; justify-content: center/);
  assert.doesNotMatch(css,/align-items: flex-end/);
  assert.match(css,/width: 84%; max-width: 640rpx; max-height: 82vh; overflow-y: auto/);
  assert.match(css,/grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.guess-option.good \{ color: #78B7FF/);
  assert.match(css,/\.guess-option.evil \{ color: #E88A94/);
  assert.match(css,/\.guess-option.good.chosen/);assert.match(css,/\.guess-option.evil.chosen/);
  assert.match(markup,/class="guess-mask" catchtap="close"/);
  assert.match(markup,/class="guess-sheet" catchtap="ignoreTap"/);
  assert.match(markup,/wx:for="\{\{sheet.options\}\}"/);
  assert.match(markup,/guess-option \{\{item.tone\}\}/);
  assert.equal((markup.match(/wx:for=/g)||[]).length,1);
});
for(const code of ['ASSASSIN','GOOD_SIDE','EVIL_SIDE']) test(`${code}: re-click selected option clears, closes and restores system/no badge`,()=>{
  const f=code==='ASSASSIN'?fixture():fixture('LOYAL_SERVANT',7,[]);
  choose(f,code);const sheet=open(f);
  assert.equal(sheet.currentRole,code);
  f.page.chooseRoleGuess({detail:{scope:sheet.scope,playerId:2,roleCode:code}});
  assert.deepEqual(plain(f.page.data.personalGuesses),{});
  assert.equal(f.page.data.roleGuessSheet,null);
  assert.equal(f.storage.has(d.storageKey(42,1)),false);
  assert.equal(display(f,2).markType,code==='ASSASSIN'?'EVIL':'');
  assert.deepEqual(f.calls,[]);assert.equal(f.vibration.length,0);
});
test('a different selection replaces side/concrete note directly and uses shared blue/red circle',()=>{
  const f=fixture('LOYAL_SERVANT',7,[]), before=plain(f.room);
  choose(f,'EVIL_SIDE');assert.equal(display(f,2).markText,'红');assert.equal(display(f,2).markClass,'evil');
  choose(f,'ASSASSIN');assert.equal(display(f,2).markText,'刺');
  choose(f,'GOOD_SIDE');assert.equal(display(f,2).markText,'蓝');assert.equal(display(f,2).markClass,'blue');
  assert.equal(display(f,2).markType,'GUESS');assert.equal(display(f,2).knowledgeType,undefined);
  assert.deepEqual(f.storage.get(d.storageKey(42,1)),{guesses:{2:'GOOD_SIDE'}});
  assert.deepEqual(plain(f.room),before);assert.deepEqual(f.calls,[]);
  assert.match(read('components/knowledge-mark/knowledge-mark.wxss'),/\.role-blue \{ background: #213f63; border-color: #4B86C6; color: #78B7FF/);
});
test('Percival re-click clears both guesses and restores both identical question badges',()=>{
  const f=fixture('PERCIVAL',7,[2,3].map(playerId=>({playerId,knowledgeType:'MERLIN_OR_MORGANA'})));
  choose(f,'MERLIN',2);const sheet=open(f,3);
  assert.deepEqual(plain(sheet.options.map(p=>p.roleCode)),['MERLIN','MORGANA']);
  f.page.chooseRoleGuess({detail:{scope:sheet.scope,playerId:3,roleCode:'MORGANA'}});
  assert.deepEqual(plain(f.page.data.personalGuesses),{});
  assert.equal(f.storage.has(d.storageKey(42,1)),false);
  for(const id of [2,3]) assert.equal(display(f,id).markType,'MERLIN_OR_MORGANA');
});
test('close centered modal leaves local guesses and current team selection unchanged',()=>{
  const f=fixture('LOYAL_SERVANT',7,[]);choose(f,'GOOD_SIDE');f.page.data.selectedIds=[3,4];
  const before=plain({game:f.game,guesses:f.page.data.personalGuesses}),sheet=open(f);
  f.page.closeRoleGuess({detail:{scope:sheet.scope}});
  assert.equal(f.page.data.roleGuessSheet,null);assert.deepEqual(f.page.data.selectedIds,[3,4]);
  assert.deepEqual(plain({game:f.game,guesses:f.page.data.personalGuesses}),before);
  assert.deepEqual(f.calls,[]);assert.equal(f.vibration.length,0);
});
for(const phase of ['ASSASSINATION','FINISHED']) test(`${phase}: clears concrete and both side notes together before role response`,()=>{
  const f=fixture('LOYAL_SERVANT',7,[]);
  choose(f,'GOOD_SIDE',2);choose(f,'EVIL_SIDE',3);choose(f,'MERLIN',4);open(f,2);
  assert.deepEqual(f.storage.get(d.storageKey(42,1)),{guesses:{2:'GOOD_SIDE',3:'EVIL_SIDE',4:'MERLIN'}});
  f.page.setData(f.page.gameStateUpdate({...f.game,phase}));f.page.decoratePlayers();
  assert.equal(f.storage.has(d.storageKey(42,1)),false);
  assert.deepEqual(plain(f.page.data.personalGuesses),{});assert.equal(f.page.data.roleGuessSheet,null);
  assert.equal(f.page.data.displayPlayers.some(p=>p.markType==='GUESS'),false);
});
