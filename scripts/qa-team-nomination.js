// Native WeChat UI QA using isolated API fixtures; no production writes or login.
// NODE_PATH=<external-install>/node_modules node scripts/qa-team-nomination.js [output-dir]
const automator=require('miniprogram-automator'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ui=require('../miniprogram/utils/presentation'),deduction=require('../miniprogram/utils/role-guesses');
const output=path.resolve(process.argv[2] || '/tmp/avalon-team-nomination');
const base=Date.now();let seq=0;
function fixture(n,viewer=1){
  const gameId=base+ ++seq,requiredTeamSize=ui.rules(n).teamSizes[3];
  const players=Array.from({length:n},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:['FangVeryLongEnglishNickname','中文昵称非常长用于显示截断','中English混合昵称较长'][i%3],me:i+1===viewer,seated:true,online:true}));
  const roleCode=viewer===1?'MERLIN':'PERCIVAL';
  return {room:{roomId:990706,roomCode:'990706',currentGameId:gameId,maxPlayers:n,currentPlayers:n,seatedPlayers:n,status:'PLAYING',myPlayerId:viewer,players},
    game:{gameId,roomId:990706,phase:'TEAM_BUILDING',missionNo:4,proposalNo:5,leaderPlayerId:1,leaderSeatNo:1,leaderNickname:'玩家1',requiredTeamSize,
      goodScore:2,evilScore:1,maxRejections:5,consecutiveRejections:4,selectedPlayerIds:[],votedPlayerIds:[],missionSubmittedPlayerIds:[],hasVoted:false,onMission:false,
      teamDraft:{gameId,missionNo:4,proposalNo:5,leaderPlayerId:1,selectedPlayerIds:[],nominatedPlayerIds:[],nominated:false,revision:0}},
    role:{roleCode,roleName:ui.ROLE_NAMES[roleCode],alignmentCode:'GOOD',confirmed:true,visiblePlayers:viewer===1?[{playerId:n,knowledgeType:'EVIL'}]:[1,n-1].map(playerId=>({playerId,knowledgeType:'MERLIN_OR_MORGANA'}))},
    timeline:{missions:[],proposals:[]},calls:[]};
}
const box=async e=>({...await e.offset(),...await e.size()});
const overlap=(a,b)=>Math.min(a.left+a.width,b.left+b.width)>Math.max(a.left,b.left)+.5 && Math.min(a.top+a.height,b.top+b.height)>Math.max(a.top,b.top)+.5;
(async()=>{
  fs.mkdirSync(output,{recursive:true});const mini=await automator.connect({wsEndpoint:'ws://127.0.0.1:9422'});
  const saved=await mini.evaluate(()=>({token:wx.getStorageSync('AVALON_GAME_TOKEN'),consent:wx.getStorageSync('AVALON_LEGAL_CONSENT')}));
  const errors=[],reports=[],rendered=[],keys=new Map();mini.on('exception',e=>errors.push(e));
  try{
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');
    let page=await mini.reLaunch('/pages/login/login');await page.waitFor(1500);page=await mini.currentPage();
    await mini.mockWxMethod('login',function(){throw Error('UI QA must not log in');});
    await mini.mockWxMethod('connectSocket',function(){return {onOpen(){},onMessage(){},onError(){},onClose(){},close(){}};});
    await mini.mockWxMethod('request',function(o){
      const f=getApp().__teamUI,r=o.data,u=o.url;let data;
      const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      if(u.endsWith('/team-draft')||u.endsWith('/team-nomination')||u.endsWith('/team')){
        const d=f.game.teamDraft;if(!d||f.game.phase!=='TEAM_BUILDING')throw Error('Mutation after dispatch');
        const version=u.endsWith('/team')?r.expectedDraftRevision:r.expectedRevision;
        if(r.missionNo!==d.missionNo||r.proposalNo!==d.proposalNo||r.leaderPlayerId!==d.leaderPlayerId||version!==d.revision)throw Error('Out-of-order UI request');
        if(r.playerIds.length>f.game.requiredTeamSize||new Set(r.playerIds).size!==r.playerIds.length)throw Error('Invalid UI team');
        f.calls.push({path:u.split('/').pop(),ids:r.playerIds.slice(),revision:version});
        if(u.endsWith('/team-draft'))f.game.teamDraft={...d,selectedPlayerIds:r.playerIds.slice(),revision:d.revision+1};
        else if(u.endsWith('/team-nomination')){
          if(d.nominated||!equal(r.playerIds,d.selectedPlayerIds)||r.playerIds.length!==f.game.requiredTeamSize)throw Error('Invalid nomination');
          f.game.teamDraft={...d,nominated:true,nominatedPlayerIds:d.selectedPlayerIds.slice(),revision:d.revision+1};
        }else{
          if(!equal(r.playerIds,d.selectedPlayerIds)||r.playerIds.length!==f.game.requiredTeamSize)throw Error('Stale final team');
          f.game={...f.game,phase:'TEAM_VOTING',selectedPlayerIds:r.playerIds.slice().sort((a,b)=>a-b),teamDraft:null};
        }
        data=u.endsWith('/team')?f.game:f.game.teamDraft;
      }else if(u.endsWith('/my-role'))data=f.role;
      else if(u.endsWith('/timeline'))data=f.timeline;
      else if(/\/room\/\d+$/.test(u))data=f.room;
      else if(/\/game\/\d+$/.test(u))data=f.game;
      else throw Error('Unexpected UI endpoint '+u);
      return {statusCode:200,data:{code:'SUCCESS',data}};
    });
    await mini.callWxMethod('setStorageSync','AVALON_GAME_TOKEN','isolated-team-ui');await page.callMethod('toggleAgreement');
    const system=await mini.systemInfo();
    async function open(f){
      const key=deduction.storageKey(f.game.gameId,f.room.myPlayerId);keys.set(key,await mini.callWxMethod('getStorageSync',key));
      await mini.evaluate(f=>{getApp().__teamUI=f;},f);const p=await mini.reLaunch('/pages/room/room?roomId=990706');
      for(let i=0;i<50;i++){if(await p.data('teamDraftSupported'))return p;await p.waitFor(50);}
      throw Error('Scoped draft did not load');
    }
    async function settled(p){for(let i=0;i<100;i++){if(!(await p.data('busy')) && !(await p.data('teamSyncPending')))return;await p.waitFor(30);}throw Error('UI sync stalled');}
    async function tapSeat(p,id){for(const seat of await p.$$('player-seat'))if((await seat.data('player')).playerId===id){await (await seat.$('.seat-avatar')).tap();await settled(p);return;}throw Error('Missing seat');}
    async function capture(p,n,name){
      const center=await p.$('.board-center'),cb=await box(center),parts=[];
      assert.equal(await center.style('background-color'),'rgba(0, 0, 0, 0)');
      for(const seat of await p.$$('player-seat')){
        assert.equal(overlap(cb,await box(await seat.$('.seat-avatar'))),false,name+' center overlaps avatar'); const caption=await seat.$('.seat-caption'),nick=await seat.$('.seat-name');assert.ok(caption&&nick);assert.ok((await box(nick)).width>0);assert.equal(await nick.style('text-overflow'),'ellipsis');
        parts.push({player:await seat.data('player'),wxml:await (await seat.$('.seat')).outerWxml()});
        const mark=await seat.$('knowledge-mark');if(mark){const body=await mark.$('.role-mark');assert.equal(await body.style('color'),'rgb(255, 255, 255)');}
      }
      rendered.push({name,n,phase:(await p.data('game')).phase,center:await center.outerWxml(),seats:parts});
      await mini.screenshot({path:path.join(output,name+'.png')});reports.push({name,copy:await center.text(),selected:await p.data('selectedIds'),nominated:await p.data('nominatedPlayerIds')});console.log('NATIVE_NOMINATION_PASS',name);
    }
    for(const n of [5,6,7,8,9,10]){
      for(const full of [false,true]){
        const f=fixture(n);f.room={...f.room,status:'WAITING',currentGameId:null,host:true,mySeatNo:1,canStart:full};f.room.players=f.room.players.slice(0,full?n:n-2).map((p,i)=>({...p,isBot:i>1,host:i===0}));f.room.currentPlayers=f.room.players.length;f.room.seatedPlayers=f.room.players.length;f.game=null;
        await mini.evaluate(f=>{getApp().__teamUI=f;},f);const p=await mini.reLaunch('/pages/room/room?roomId=990706');await p.waitFor(200);await p.callMethod('stop');
        assert.equal(await p.data('lobbyStatus'),ui.lobbyStatus(f.room));const center=await p.$('.lobby-center');assert.equal(await center.style('background-color'),'rgba(0, 0, 0, 0)');assert.equal(await (await p.$('.bot-add')).property('disabled'),full);
        const parts=[],boxes=[];for(const seat of await p.$$('player-seat')){const player=await seat.data('player');const avatar=await box(await seat.$('.seat-avatar'));assert.equal(overlap(await box(center),avatar),false);const nick=await seat.$('.seat-name');assert.ok(nick);assert.equal(await nick.style('text-overflow'),'ellipsis');parts.push({player,wxml:await (await seat.$('.seat')).outerWxml()});boxes.push(await box(await seat.$('.seat-caption')));}
        for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)assert.equal(overlap(boxes[a],boxes[b]),false,'lobby captions overlap');
        const name=n+'-lobby-'+(full?'full':'waiting');rendered.push({name,n,lobby:true,seats:parts,center:await center.outerWxml()});await mini.screenshot({path:path.join(output,name+'.png')});console.log('LOBBY_PASS',name);
      }
    }
    for(const n of [5,6,7,8,9,10]){
      const f=fixture(n);let p=await open(f);const required=f.game.requiredTeamSize,original=Array.from({length:required},(_,i)=>i+1),latest=Array.from({length:required},(_,i)=>n-required+i+1);
      assert.ok(await p.$('.phase-actions .btn.nomination-button'));assert.ok(await p.$('.phase-actions .btn:not(.nomination-button)'));
      const disabled=await (await p.$('.phase-actions .btn.nomination-button')).property('disabled');assert.ok(disabled===true||disabled==='true');
      for(const id of original)await tapSeat(p,id);await capture(p,n,n+'-before-nomination');
      await (await p.$('.phase-actions .btn.nomination-button')).tap();await settled(p);
      assert.equal(await p.data('teamNominated'),true);assert.equal(await p.$('.phase-actions .btn.nomination-button'),null);await capture(p,n,n+'-nominated');
      const first=await p.data('nominatedText');for(const id of await p.data('selectedIds'))await tapSeat(p,id);
      assert.ok(await (await p.$('.phase-actions .btn:not(.nomination-button)')).property('disabled'));
      for(const id of latest)await tapSeat(p,id);
      assert.equal(await p.data('nominatedText'),first);assert.deepEqual(await p.data('selectedIds'),latest);
      const copy=await (await p.$('.board-center')).text();assert.ok(copy.includes('队长已提名：'+first));assert.equal(copy.includes('已选：'),false);assert.equal(copy.includes('本轮需要'),false);
      await capture(p,n,n+'-nominated-edited');await (await p.$('.phase-actions .btn:not(.nomination-button)')).tap();await settled(p);
      assert.equal((await p.data('game')).phase,'TEAM_VOTING');assert.deepEqual(await p.data('selectedIds'),latest);assert.equal(await p.data('teamNominated'),false);await capture(p,n,n+'-final-voting');
      const calls=await mini.evaluate(()=>getApp().__teamUI.calls);assert.equal(calls.filter(c=>c.path==='team-nomination').length,1);assert.deepEqual(calls.at(-1).ids,latest);
      const viewer=fixture(n,2);viewer.game.teamDraft={...viewer.game.teamDraft,selectedPlayerIds:latest,nominatedPlayerIds:original,nominated:true,revision:40};
      p=await open(viewer);assert.equal(await p.$('.phase-actions .btn.nomination-button'),null);assert.equal(await p.$('.phase-actions .btn:not(.nomination-button)'),null);await tapSeat(p,n);assert.deepEqual(await p.data('selectedIds'),latest);
      assert.equal((await mini.evaluate(()=>getApp().__teamUI.calls)).length,0);await capture(p,n,n+'-viewer');
      // A newer public WS snapshot updates halos without refetching or changing the first nomination.
      const next={...viewer.game.teamDraft,selectedPlayerIds:original,revision:41};await p.callMethod('handleRoomEvent',{roomId:990706,type:'TEAM_DRAFT_UPDATED',teamDraft:next});
      assert.deepEqual(await p.data('selectedIds'),original);assert.equal(await p.data('nominatedText'),original.join(' · '));
    }
    assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({system,reports,errors},null,2));fs.writeFileSync(path.join(output,'rendered.json'),JSON.stringify(rendered,null,2));
  }finally{
    const p=await mini.currentPage();if(p.path==='pages/room/room')await p.callMethod('stop');
    for(const [key,value] of keys)if(value)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');await mini.reLaunch('/pages/login/login');
    for(const method of ['login','request','connectSocket'])await mini.restoreWxMethod(method);
    for(const [key,value] of [['AVALON_GAME_TOKEN',saved.token],['AVALON_LEGAL_CONSENT',saved.consent]])if(value)await mini.callWxMethod('setStorageSync',key,value);
    await mini.evaluate(()=>{delete getApp().__teamUI;});mini.disconnect();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
