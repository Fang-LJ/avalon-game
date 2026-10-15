// Isolated native rendering QA; production requests, login and game writes are blocked.
// NODE_PATH=<temporary dependencies>/node_modules node scripts/qa-room-preparation.js [output]
const automator=require('miniprogram-automator'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=process.argv[2]||'/tmp/avalon-room-preparation';fs.mkdirSync(output,{recursive:true});
const ui=require('../miniprogram/utils/presentation');let serial=Date.now();
function fixture(n,host=true,full=false){const players=Array.from({length:full?n:n-1},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:['FangEnglishNameLong','中文昵称很长用于截断','中English混合昵称'][i%3],me:i===0,host:host?i===0:i===1,seated:true,online:true,isBot:i>1}));return {room:{roomId:983421,roomCode:'983421',maxPlayers:n,currentPlayers:players.length,seatedPlayers:players.length,host,myPlayerId:1,mySeatNo:1,status:'WAITING',currentGameId:null,canStart:host&&full,players},game:null,role:null,timeline:{missions:[],proposals:[]}};}
(async()=>{
 const mini=await automator.connect({wsEndpoint:'ws://127.0.0.1:9422'});await new Promise(r=>setTimeout(r,3000));const saved=await mini.evaluate(()=>({token:wx.getStorageSync('AVALON_GAME_TOKEN'),consent:wx.getStorageSync('AVALON_LEGAL_CONSENT')}));const reports=[],errors=[];mini.on('exception',e=>errors.push(e));
 try{
  for(const key of ['AVALON_GAME_TOKEN','AVALON_LEGAL_CONSENT'])await mini.callWxMethod('removeStorageSync',key);
  const login=await mini.reLaunch('/pages/login/login');await login.waitFor(1000);
  await mini.mockWxMethod('login',function(){throw Error('No login in UI QA');});
  await mini.mockWxMethod('connectSocket',function(){return {onOpen(){},onMessage(){},onError(){},onClose(){},close(){}};});
  await mini.mockWxMethod('request',function(o){if(o.method&&o.method!=='GET')throw Error('No backend writes in UI QA');const f=getApp().__prepUI,u=o.url;return {statusCode:200,data:{code:'SUCCESS',data:u.endsWith('/my-role')?f.role:u.endsWith('/timeline')?f.timeline:/\/room\/\d+$/.test(u)?f.room:/\/game\/\d+$/.test(u)?f.game:{profileComplete:true}}};});
  await mini.callWxMethod('setStorageSync','AVALON_GAME_TOKEN','isolated-preparation-ui');await login.callMethod('toggleAgreement');
  const system=await mini.systemInfo();
  async function measure(identity){return mini.evaluate(identity=>new Promise(resolve=>{const q=wx.createSelectorQuery();q.select('.preparation-page').boundingClientRect();q.select('.preparation-scroll').boundingClientRect();q.select(identity?'.identity-body':'.lobby-body').boundingClientRect();q.select('.lobby-footer').boundingClientRect();q.select('.preparation-scroll').scrollOffset();q.selectViewport().scrollOffset();q.exec(resolve);}),identity);}
  async function open(f){await mini.evaluate(f=>{getApp().__prepUI=f;},f);const p=await mini.reLaunch('/pages/room/room?roomId=983421');await p.waitFor(180);await p.callMethod('stop');assert.equal(await p.data('roomId'),983421);return p;}
  async function capture(p,name,identity=false){
   let geometry=null;
   if(!identity){
    const players=await p.data('displayPlayers'),n=(await p.data('room')).maxPlayers;assert.deepEqual(players.map(s=>s.position),ui.lobbySeats(players,n,true).map(s=>s.position),'simulator must run current lobby source');
    const seats=await p.$$('player-seat'),avatars=[];
    // Automator rounds offsets/sizes to whole pixels; allow at most 2px radial spread.
    for(const seat of seats){const avatar=await seat.$('.seat-avatar'),o=await avatar.offset(),z=await avatar.size();avatars.push({x:o.left+Number(z.width)/2,y:o.top+Number(z.height)/2});}
    const cx=avatars.reduce((v,a)=>v+a.x,0)/avatars.length,cy=avatars.reduce((v,a)=>v+a.y,0)/avatars.length,radii=avatars.map(a=>Math.hypot(a.x-cx,a.y-cy));
    assert.ok(Math.max(...radii)-Math.min(...radii)<2,'native circle '+JSON.stringify({avatars,cx,cy,radii}));
    geometry={avatars,radiusMin:Math.min(...radii),radiusMax:Math.max(...radii)};
   }
   const header=await p.$('page-head'),title=await header.$('.title'),titleTop=(await title.offset()).top;assert.ok(titleTop>=system.statusBarHeight);
   const before=await measure(identity),scroll=await p.$('.preparation-scroll');assert.ok(before[1].height>0);assert.ok(before[0].height<=system.windowHeight+1);
   if(before[3]){const start=await p.$('.lobby-footer button:last-child'),r=await start.offset(),size=await start.size();assert.ok(r.top+size.height<=system.safeArea.bottom+1,'button clears safe area');}
   await scroll.scrollTo(0,10000);await p.waitFor(150);const after=await measure(identity);
   assert.equal((await title.offset()).top,titleTop,'header stays fixed');assert.equal(after[5].scrollTop,0,'native page does not scroll');
   const overflowing=before[2].height>before[1].height+1;
   if(overflowing)assert.ok(after[4].scrollTop>0,'overflow content remains reachable');else assert.ok(after[4].scrollTop<=1,'fitting content has no scroll range');
   if(before[3])assert.equal(after[3].top,before[3].top,'footer stays fixed');
   if(identity)assert.ok(await p.$('card-deal-stage'));
   await scroll.scrollTo(0,0);await mini.screenshot({path:path.join(output,name+'.png')});
   const root=await p.$('.preparation-page');reports.push({name,system,identity,overflowing,before,after,geometry,markup:await root.outerWxml(),players:await p.data('displayPlayers')});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({reports,errors},null,2));console.log('PREPARATION_PASS',name,'overflow='+overflowing);
  }
  for(const n of (process.env.AVALON_QA_SIZES?process.env.AVALON_QA_SIZES.split(',').map(Number):[5,6,7,8,9,10])){
   for(const host of [true,false])for(const full of [false,true]){
    const f=fixture(n,host,full),p=await open(f),invite=await p.$('.lobby-invite'),start=await p.$('.lobby-start');assert.equal(!!start,host);
    const actions=await p.$$('.lobby-room-actions button'),bot=await p.$('.bot-add');
    assert.equal(actions.length,host?4:3);assert.equal(await bot.property('disabled'),!host||full);
    const widths=[];for(const b of actions)widths.push(Number((await b.size()).width));assert.ok(Math.max(...widths)-Math.min(...widths)<1,'equal action widths');
    assert.equal(await invite.property('disabled'),full);assert.equal(await invite.attribute('open-type'),full?'':'share');
    if(start){const a=await invite.size(),b=await start.size();assert.ok(full?a.width/b.width<.6:a.width/b.width>1.7,'native button proportions');assert.equal(await start.property('disabled'),!full);await p.setData({room:{...f.room,canStart:false}});assert.equal(await start.property('disabled'),true);await p.setData({room:f.room});}
    await capture(p,`${n}-${host?'host':'member'}-${full?'full':'waiting'}`);
    if(host){
     const color=await invite.style('background-color'),startColor=await start.style('background-color');
     await p.setData({botAdding:true});assert.equal(await invite.style('background-color'),color);assert.equal(await start.style('background-color'),startColor);
     assert.equal(await invite.property('disabled'),full);assert.equal(await start.property('loading'),false);assert.equal(await start.property('disabled'),true);assert.equal(await bot.property('disabled'),true);
     if(!full){await p.setData({room:{...f.room,currentPlayers:n,seatedPlayers:n,canStart:true}});const readyColor=await start.style('background-color');await p.setData({botAdding:false});assert.equal(await start.style('background-color'),readyColor,'full roster readiness does not flash');await p.setData({room:f.room});}
     else await p.setData({botAdding:false});
    }
    if(n===5&&!full){await p.setData({room:{...f.room,host:!host}});assert.equal(!!await p.$('.lobby-start'),!host);}
   }
  }
  for(const n of [5,7,8,10].filter(n=>!process.env.AVALON_QA_SIZES||process.env.AVALON_QA_SIZES.split(',').map(Number).includes(n))){
   const f=fixture(n,true,true);f.room.status='PLAYING';f.room.currentGameId=++serial;
   f.game={gameId:serial,roomId:983421,phase:'ROLE_CONFIRM',missionNo:1,proposalNo:1,confirmedCount:n-1,playerCount:n,selectedPlayerIds:[],votedPlayerIds:[],missionSubmittedPlayerIds:[]};
   f.role={roleCode:n===10?'MERLIN':'LOYAL_SERVANT',roleName:n===10?'梅林':'忠臣',alignmentCode:'GOOD',alignmentName:'正义阵营',confirmed:false,instruction:'帮助正义阵营完成任务，保护梅林。',visiblePlayers:n===10?[7,8,10].map(id=>({playerId:id,seatNo:id,nickname:'长昵称'.repeat(15),knowledgeType:'EVIL'})):[]};
   const p=await open(f),stage=await p.$('card-deal-stage');await stage.callMethod('cancelTimer');await stage.callMethod('reveal');await p.waitFor(700);await capture(p,n+'-identity',true);
  }
  assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({reports,errors},null,2));
 }catch(error){console.error("PRIMARY_QA_ERROR",error);throw error;}finally{
  const p=await mini.currentPage();if(p.path==='pages/room/room')await p.callMethod('stop');for(const key of ['AVALON_GAME_TOKEN','AVALON_LEGAL_CONSENT'])await mini.callWxMethod('removeStorageSync',key);await mini.reLaunch('/pages/login/login').catch(()=>{});
  for(const method of ['login','request','connectSocket'])await mini.restoreWxMethod(method);for(const [key,value]of [['AVALON_GAME_TOKEN',saved.token],['AVALON_LEGAL_CONSENT',saved.consent]])if(value)await mini.callWxMethod('setStorageSync',key,value);await mini.evaluate(()=>{delete getApp().__prepUI;});mini.disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
