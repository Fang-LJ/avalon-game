// Native WeChat simulator QA with isolated fixtures and no backend writes.
// NODE_PATH=/tmp/avalon-third-tools/node_modules node scripts/qa-compact-room.js [output-dir]
const automator=require('miniprogram-automator'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ui=require('../miniprogram/utils/presentation');
const output=path.resolve(process.argv[2]||'/tmp/avalon-compact-room');
const cases=[['REJECTED',null,'提案未通过'],['APPROVED',null,'任务进行中'],
  ['APPROVED',{status:'SUCCESS',successCount:4,failCount:0},'任务成功'],
  ['APPROVED',{status:'SUCCESS',successCount:3,failCount:1},'任务成功 · 1 张失败牌'],
  ['APPROVED',{status:'FAILED',successCount:3,failCount:1},'任务失败 · 1 张失败牌'],
  ['APPROVED',{status:'FAILED',successCount:2,failCount:2},'任务失败 · 2 张失败牌']];
function fixture(n,roleCode='MERLIN',host=false,phase='TEAM_VOTING'){
  const players=Array.from({length:n},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:'玩家'+(i+1),me:i===0,seated:true,online:true}));
  return {room:{roomId:991027,roomCode:'991027',currentGameId:991027,maxPlayers:n,currentPlayers:n,status:'PLAYING',host,myPlayerId:1,players},
    role:{roleCode,roleName:ui.ROLE_NAMES[roleCode],alignmentCode:roleCode==='MERLIN'?'GOOD':'EVIL',visiblePlayers:[],confirmed:true},
    game:{gameId:991027,roomId:991027,phase,missionNo:4,proposalNo:2,leaderPlayerId:1,leaderSeatNo:1,requiredTeamSize:4,
      goodScore:2,evilScore:1,consecutiveRejections:0,maxRejections:5,selectedPlayerIds:[1,2,3,4],votedPlayerIds:[],missionSubmittedPlayerIds:[],assassin:roleCode==='ASSASSIN',hasVoted:false,onMission:false,hasSubmittedMission:false},
    timeline:{proposals:cases.map(([status],i)=>({proposalId:i+1,missionNo:4,proposalNo:i+1,status,leaderPlayerId:1,leaderSeatNo:1,teamPlayerIds:[1,2,3,4],votes:players.map(p=>({seatNo:p.seatNo,choice:p.seatNo%2?'APPROVE':'REJECT'}))})),
      missions:cases.flatMap(([,mission],i)=>mission?[{...mission,missionNo:4,approvedProposalId:i+1}]:[])}};
}
const box=async e=>({...await e.offset(),...await e.size()});
(async()=>{
  fs.mkdirSync(output,{recursive:true});const mini=await automator.connect({wsEndpoint:'ws://127.0.0.1:9422'});
  const saved=await mini.evaluate(()=>({token:wx.getStorageSync('AVALON_GAME_TOKEN'),consent:wx.getStorageSync('AVALON_LEGAL_CONSENT')}));
  const errors=[],reports=[],rendered=[];mini.on('exception',e=>errors.push(e));
  try{
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');
    let p=await mini.reLaunch('/pages/login/login');await p.waitFor(1200);p=await mini.currentPage();
    await mini.mockWxMethod('login',function(){throw Error('QA must not log in');});
    await mini.mockWxMethod('connectSocket',function(){return {onOpen(){},onMessage(){},onError(){},onClose(){},close(){}};});
    await mini.mockWxMethod('request',function(o){
      if(o.method && o.method!=='GET')throw Error('QA must not write to backend');
      const f=getApp().__compactFixture,u=o.url;let data;
      if(u.endsWith('/my-role'))data=f.role;else if(u.endsWith('/timeline'))data=f.timeline;
      else if(/\/room\/\d+$/.test(u))data=f.room;else if(/\/game\/\d+$/.test(u))data=f.game;
      else throw Error('Unexpected endpoint '+u);
      return {statusCode:200,data:{code:'SUCCESS',data}};
    });
    await mini.mockWxMethod('showModal',function(o){getApp().__compactDialog={title:o.title,content:o.content};return {confirm:false,cancel:true};});
    await mini.callWxMethod('setStorageSync','AVALON_GAME_TOKEN','isolated-compact-qa');await p.callMethod('toggleAgreement');
    const system=await mini.systemInfo(),scale=system.windowWidth/750;
    async function open(f){
      await mini.evaluate(f=>{getApp().__compactFixture=f;},f);
      const p=await mini.reLaunch('/pages/room/room?roomId=991027');
      for(let i=0;i<60;i++){if(await p.data('board'))break;await p.waitFor(50);}
      assert.ok(await p.data('board'));await p.callMethod('stop');
      await mini.evaluate(()=>{getCurrentPages().at(-1).active=true;});await p.waitFor(150);return p;
    }
    for(const n of [5,6,7,8,9,10]){
      p=await open(fixture(n));const log=await p.$('game-log'),sw=await log.$('swiper');
      assert.equal((await p.$$('.room-quick-actions button')).length,2);
      const track=await box(await p.$('mission-track')),actions=await box(await p.$('.room-quick-actions'));
      assert.ok(track.left+track.width<actions.left);assert.ok(actions.left+actions.width<=system.windowWidth);
      for(let i=0;i<cases.length;i++){
        await sw.swipeTo(i);await p.waitFor(350);assert.equal(await log.data('historyIndex'),i);
        const cards=await log.$$('.compact-entry'),card=cards[i],b=await box(card);
        assert.ok(Math.abs(b.height-240*scale)<1,JSON.stringify(b));assert.equal((await card.$$('image')).length,0);
        assert.equal((await card.$$('.vote-cell')).length,n);assert.equal(await (await card.$('.compact-mission-summary')).text(),cases[i][2]);
        const summary=await box(await card.$('.compact-mission-summary'));assert.ok(summary.top+summary.height<=b.top+b.height);
        rendered.push({n,index:i,card:await card.outerWxml(),text:cases[i][2]});
      }
      // Pager interaction stays native and must not reopen an overlay during motion.
      const cards=await log.$$('.compact-entry');await (await cards[5].$('.pager-arrow')).tap();await p.waitFor(550);assert.equal(await log.data('historyIndex'),4);
      const head=await p.$('page-head'),trackEl=await p.$('mission-track');
      rendered[rendered.length-1].header=await (await head.$('.page-head')).outerWxml();
      rendered[rendered.length-1].track=await (await trackEl.$('.track')).outerWxml();
      rendered[rendered.length-1].actions=await (await p.$('.room-quick-actions')).outerWxml();
      if([5,10].includes(n)){await mini.pageScrollTo(180);await mini.screenshot({path:path.join(output,n+'-compact.png')});}
      await p.callMethod('openRoomMore');assert.equal(await p.data('moreMenuOpen'),true);
      await (await p.$('.room-more-dialog')).tap();assert.equal(await p.data('moreMenuOpen'),true);
      await (await p.$('.history-action')).tap();await p.waitFor(100);
      assert.equal(await p.data('moreMenuOpen'),false);assert.equal(await log.data('allHistoryOpen'),true);
      assert.equal((await log.$$('.history-sheet .mission-thumbnail')).length,16);
      await log.callMethod('closeAllHistory');reports.push({n,cases:6,track,actions});console.log('NATIVE_COMPACT_PASS',n);
    }
    for(const [role,host,phase] of [['MERLIN',false,'TEAM_VOTING'],['MINION',false,'TEAM_VOTING'],['ASSASSIN',true,'TEAM_VOTING'],['ASSASSIN',true,'ASSASSINATION']]){
      p=await open(fixture(10,role,host,phase));await p.callMethod('openRoomMore');
      const buttons=await p.$$('.room-more-action'),labels=[];for(const b of buttons)labels.push(await b.text());
      const expected=['全部提案','退出房间'];if(host)expected.push('结束对局');if(role==='ASSASSIN'&&phase!=='ASSASSINATION')expected.push('提前刺杀');assert.deepEqual(labels,expected);
      if(role==='ASSASSIN'&&phase!=='ASSASSINATION'){
        const dialog=await p.$('.room-more-overlay');fs.writeFileSync(path.join(output,'menu.json'),JSON.stringify({wxml:await dialog.outerWxml(),labels}));
        await mini.screenshot({path:path.join(output,'assassin-host-menu.png')});
        await buttons.at(-1).tap();await p.waitFor(100);assert.equal(await p.data('moreMenuOpen'),false);
        const confirm=await mini.evaluate(()=>getApp().__compactDialog);assert.equal(confirm.title,'发动提前刺杀？');assert.match(confirm.content,/不可撤销/);
      }else{await (await p.$('.room-more-close')).tap();assert.equal(await p.data('moreMenuOpen'),false);}
      if(phase==='ASSASSINATION')assert.match(await (await p.$('.phase-actions')).text(),/确认刺杀/);
      await p.callMethod('openRoomMore');await (await p.$('.room-more-overlay')).tap();assert.equal(await p.data('moreMenuOpen'),false);
      console.log('NATIVE_MENU_PASS',role,host,phase);
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'native-report.json'),JSON.stringify({system,reports,errors},null,2));
    fs.writeFileSync(path.join(output,'rendered.json'),JSON.stringify(rendered,null,2));
  }finally{
    const p=await mini.currentPage();if(p.path==='pages/room/room')await p.callMethod('stop');
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');await mini.reLaunch('/pages/login/login');
    for(const method of ['login','request','connectSocket','showModal'])await mini.restoreWxMethod(method);
    for(const [key,value]of [['AVALON_GAME_TOKEN',saved.token],['AVALON_LEGAL_CONSENT',saved.consent]])if(value)await mini.callWxMethod('setStorageSync',key,value);
    await mini.evaluate(()=>{delete getApp().__compactFixture;delete getApp().__compactDialog;});mini.disconnect();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
