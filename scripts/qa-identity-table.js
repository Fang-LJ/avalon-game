// Native rendering QA with read-only, authorized DTO fixtures. No production calls.
// IDE: cli auto --project <repo>/miniprogram --auto-port 9422
// NODE_PATH=<external-install>/node_modules node scripts/qa-identity-table.js [output-dir]
const automator = require('miniprogram-automator');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ui = require('../miniprogram/utils/presentation');
const deduction = require('../miniprogram/utils/role-guesses');
const output = path.resolve(process.argv[2] || '/tmp/avalon-identity-table');
const roomId = 989106;
const codes = {
  5: ['MERLIN','PERCIVAL','LOYAL_SERVANT','MORGANA','ASSASSIN'],
  6: ['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','MORGANA','ASSASSIN'],
  7: ['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','MORGANA','ASSASSIN','OBERON'],
  8: ['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','MORGANA','ASSASSIN','MINION'],
  9: ['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','MORGANA','ASSASSIN','MORDRED'],
  10: ['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','MORGANA','ASSASSIN','MORDRED','OBERON'],
};
let sequence = 0;
const gameIdBase = Date.now();
function fixture(n, phase, forced = false, viewer = 'MERLIN', longTarget = false) {
  const roles = codes[n], myPlayerId = roles.indexOf(viewer) + 1;
  const players = roles.map((_, i) => ({playerId:i+1, seatNo:i+1, nickname:'玩家'+(i+1), me:i+1===myPlayerId, seated:true, online:true}));
  const evil = roles.flatMap((roleCode,i)=>['MORGANA','ASSASSIN','MINION','MORDRED','OBERON'].includes(roleCode)?[{playerId:i+1,roleCode}]:[]);
  // Supply only each role's authorized view, never an omniscient private-role DTO.
  const visiblePlayers = viewer === 'MERLIN' ? evil.filter(p=>p.roleCode!=='MORDRED').map(p=>({playerId:p.playerId,knowledgeType:'EVIL'}))
    : viewer === 'PERCIVAL' ? roles.flatMap((role,i)=>['MERLIN','MORGANA'].includes(role)?[{playerId:i+1,knowledgeType:'MERLIN_OR_MORGANA'}]:[])
    : viewer === 'ASSASSIN' ? evil.filter(p=>p.playerId!==myPlayerId && p.roleCode!=='OBERON').map(p=>({...p,knowledgeType:'EVIL_ALLY'})) : [];
  const requiredTeamSize = ui.rules(n).teamSizes[2];
  return {
    room:{roomId,roomCode:'989106',currentGameId:gameIdBase + ++sequence,maxPlayers:n,currentPlayers:n,seatedPlayers:n,host:true,status:'PLAYING',myPlayerId,players},
    game:{gameId:gameIdBase+sequence,roomId,phase,missionNo:3,proposalNo:forced?5:1,goodScore:1,evilScore:1,
      consecutiveRejections:forced?4:0,maxRejections:5,requiredTeamSize,leaderPlayerId:myPlayerId,leaderSeatNo:myPlayerId,
      selectedPlayerIds:Array.from({length:requiredTeamSize},(_,i)=>i+1),votedPlayerIds:phase==='TEAM_VOTING'?players.map(p=>p.playerId):[],
      missionSubmittedPlayerIds:[],assassin:viewer==='ASSASSIN',evil:viewer==='ASSASSIN',hasVoted:false,onMission:true,hasSubmittedMission:false,
      revealedEvilIdentities:phase==='ASSASSINATION'?evil:[],assassinationEarly:phase==='ASSASSINATION',
      assassinationTarget:longTarget?{playerId:3,seatNo:3,nickname:'测'.repeat(32)}:null,assassinationTargetRevision:longTarget?1:0,
      ladyHolder:phase==='LADY_OF_LAKE',ladyHolderPlayerId:myPlayerId,ladyHolderNickname:'玩家1',ladyHistory:[],ladyEligibleTargetIds:players.filter(p=>p.playerId!==myPlayerId).map(p=>p.playerId)},
    role:{roleCode:viewer,roleName:ui.ROLE_NAMES[viewer],alignmentCode:viewer==='ASSASSIN'?'EVIL':'GOOD',confirmed:true,visiblePlayers},
    timeline:{missions:[],proposals:[]},
  };
}
const box = async el => ({...await el.offset(),...await el.size()});
const overlap = (a,b) => Math.min(a.left+a.width,b.left+b.width)>Math.max(a.left,b.left)+.5 && Math.min(a.top+a.height,b.top+b.height)>Math.max(a.top,b.top)+.5;
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const mini = await automator.connect({wsEndpoint:'ws://127.0.0.1:9422'});
  const saved = await mini.evaluate(()=>({token:wx.getStorageSync('AVALON_GAME_TOKEN'),consent:wx.getStorageSync('AVALON_LEGAL_CONSENT')}));
  const results=[], rendered=[], errors=[], storageRecords=new Map();
  mini.on('exception', e=>errors.push(e));
  try {
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');
    await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');
    let page = await mini.reLaunch('/pages/login/login'); await page.waitFor(1800);
    page = await mini.currentPage();
    await mini.mockWxMethod('login',function(){throw Error('UI fixtures must never log in');});
    await mini.mockWxMethod('request',function(options){
      if(options.method && options.method!=='GET')throw Error('UI fixtures cannot write to backend');
      const f=getApp().__identityTableFixture,u=options.url;
      const data=u.endsWith('/my-role')?f.role:u.endsWith('/timeline')?f.timeline:/\/room\/\d+$/.test(u)?f.room:/\/game\/\d+$/.test(u)?f.game:{profileComplete:true};
      return {statusCode:200,data:{code:'SUCCESS',data}};
    });
    await mini.mockWxMethod('connectSocket',function(){return {onOpen(){},onMessage(){},onError(){},onClose(){},close(){}};});
    await mini.callWxMethod('setStorageSync','AVALON_GAME_TOKEN','isolated-identity-table-fixture');
    await page.callMethod('toggleAgreement');
    const system = await mini.systemInfo(), scale=system.windowWidth/750;
    async function open(f) {
      const key=deduction.storageKey(f.game.gameId,f.room.myPlayerId);
      storageRecords.set(key,await mini.callWxMethod('getStorageSync',key));
      await mini.evaluate(f=>{getApp().__identityTableFixture=f;},f);
      const p=await mini.reLaunch('/pages/room/room?roomId='+roomId);
      await p.waitFor(150);assert.equal((await p.data('game')).phase,f.game.phase);
      await p.callMethod('stop');await mini.pageScrollTo(0);return p;
    }
    async function capture(p,name,n,phase) {
      const center=await p.$('.board-center'),board=await p.$('.board');
      const centerBox=await box(center),boardBox=await box(board);
      assert.ok(Math.abs(centerBox.left+centerBox.width/2-boardBox.left-boardBox.width/2)<1,'center stays symmetric');
      assert.equal(await center.style('background-color'),'rgba(0, 0, 0, 0)');
      assert.equal(await center.style('padding-left'),'0px');
      const seats=await p.$$('player-seat'), measures=[], parts=[];
      for(const seat of seats){
        const avatar=await box(await seat.$('.seat-avatar'));
        assert.ok(!overlap(centerBox,avatar),name+' center overlaps avatar');
        const badges={};
        for(const cls of ['leader-icon','action-done-icon','me-icon','knowledge-icon']){
          const el=await seat.$('.'+cls);if(el)badges[cls]=await box(el);
        }
        for(const cls of ['leader-icon','action-done-icon','me-icon'])if(badges[cls])assert.ok(!overlap(centerBox,badges[cls]),name+' center overlaps '+cls);
        for(const [a,b] of [['leader-icon','action-done-icon'],['me-icon','knowledge-icon'],['action-done-icon','knowledge-icon']])if(badges[a]&&badges[b])assert.ok(!overlap(badges[a],badges[b]),'badge anchors stay separate');
        const mark=await seat.$('knowledge-mark');
        if(mark){
          const body=await mark.$('.role-mark');assert.ok(body,'all marks are rectangles');
          assert.equal(await body.style('color'),'rgb(255, 255, 255)');
          const backgrounds={evil:'rgb(169, 52, 71)',merlin:'rgb(163, 107, 19)',percival:'rgb(128, 82, 193)',candidate:'rgb(128, 82, 193)',loyal:'rgb(20, 127, 167)',blue:'rgb(20, 127, 167)'};
          assert.equal(await body.style('background-color'),backgrounds[await seat.data('player.markClass')]);
          const size=await body.size();assert.ok(Math.abs(size.height-(n>=9?34:38)*scale)<1);
          const b=await box(body);assert.ok(b.left>=0 && b.left+b.width<=system.windowWidth,'badge fits screen');
          assert.equal(await mark.$('.evil-crescent'),null);
          const question=await mark.$('.guess-question');if(question)assert.equal(await question.style('color'),'rgb(229, 201, 122)');
        }
        parts.push({player:await seat.data('player'),wxml:await (await seat.$('.seat')).outerWxml()});
        measures.push({avatar,badges});
      }
      const copy=await center.text();assert.ok(copy.length>0);
      if(phase==='ASSASSINATION'){
        assert.ok(copy.includes('刺中梅林，邪恶阵营获胜；刺错则正义阵营获胜'));
        const selection=await center.$('.assassination-selection');
        assert.equal(await selection.style('white-space'),'normal');assert.notEqual(await selection.style('text-overflow'),'ellipsis');
      }
      await mini.screenshot({path:path.join(output,name+'.png')});
      rendered.push({name,n,phase,center:await center.outerWxml(),seats:parts});results.push({name,center:centerBox,board:boardBox,seats:measures,copy});
      fs.writeFileSync(path.join(output,'native-report.json'),JSON.stringify({system,results,errors},null,2));
      fs.writeFileSync(path.join(output,'rendered.json'),JSON.stringify(rendered,null,2));
      console.log('NATIVE_TABLE_PASS',name);
    }
    const counts=process.env.AVALON_QA_COUNTS ? process.env.AVALON_QA_COUNTS.split(',').map(Number) : [5,6,7,8,9,10];
    assert.ok(counts.every(n=>codes[n]),'supported player counts');
    for(const n of counts){
      for(const [phase,forced,long] of [['TEAM_BUILDING',false],['TEAM_VOTING',false],['TEAM_BUILDING',true],['TEAM_VOTING',true],['MISSION_EXECUTING',false],['ASSASSINATION',false],['ASSASSINATION',false,true],...(n===10?[['LADY_OF_LAKE',false]]:[])]){
        const f=fixture(n,phase,forced,'MERLIN',long),p=await open(f);
        if(phase==='TEAM_BUILDING'||phase==='TEAM_VOTING'){
          assert.equal((await p.$$('.rejection-dot')).length,5);assert.equal((await p.$$('.rejection-dot.rejected')).length,forced?4:0);
          assert.equal((await (await p.$('.board-center')).text()).includes('本轮若再次否决，邪恶阵营直接获胜'),forced);
        }
        if(n>=9 && phase==='TEAM_BUILDING')assert.equal((await p.data('displayPlayers')).find(p=>p.playerId===codes[n].indexOf('MORDRED')+1).markType,'');
        await capture(p,`${n}-${phase}${forced?'-forced':''}${long?'-long':''}`,n,phase);
      }
    }
    for(const viewer of ['MERLIN','PERCIVAL','ASSASSIN','LOYAL_SERVANT']){
      const f=fixture(10,'TEAM_BUILDING',false,viewer),p=await open(f);
      // Stop network timers, retain active local interaction gate for the private sheet.
      await mini.evaluate(()=>{getCurrentPages()[getCurrentPages().length-1].active=true;});
      const target=viewer==='PERCIVAL'?1:viewer==='LOYAL_SERVANT'?2:7;
      if(viewer!=='ASSASSIN'){
        await p.callMethod('openRoleGuess',{detail:{playerId:target}});
        const sheet=await p.data('roleGuessSheet');assert.ok(sheet);
        const code=viewer==='PERCIVAL'?'MERLIN':viewer==='MERLIN'?'ASSASSIN':'GOOD_SIDE';
        await p.callMethod('chooseRoleGuess',{detail:{scope:sheet.scope,playerId:target,roleCode:code}});
        assert.equal((await p.data('displayPlayers')).find(p=>p.playerId===target).markType,'GUESS');
        await capture(p,'10-'+viewer+'-guess',10,'TEAM_BUILDING');
        if(viewer==='PERCIVAL'){
          await p.callMethod('openRoleGuess',{detail:{playerId:target}});const swap=await p.data('roleGuessSheet');
          await p.callMethod('chooseRoleGuess',{detail:{scope:swap.scope,playerId:target,roleCode:'MORGANA'}});
          assert.equal((await p.data('displayPlayers')).find(p=>p.playerId===target).markText,'娜');
        }
        await p.callMethod('openRoleGuess',{detail:{playerId:target}});const clear=await p.data('roleGuessSheet');
        await p.callMethod('clearRoleGuess',{detail:{scope:clear.scope,playerId:target}});
      }
      if(viewer==='PERCIVAL'){
        const candidates=(await p.data('displayPlayers')).filter(p=>p.markType==='MERLIN_OR_MORGANA');assert.equal(candidates.length,2);
        const appearances=[];
        for(const seat of await p.$$('player-seat'))if((await seat.data('player')).markType==='MERLIN_OR_MORGANA'){
          const body=await (await seat.$('knowledge-mark')).$('.candidate-mark');
          appearances.push({text:await body.text(),color:await body.style('background-color'),size:await body.size()});
        }
        assert.deepEqual(appearances[0],appearances[1]);assert.equal(appearances[0].text,'?');assert.equal(appearances[0].color,'rgb(128, 82, 193)');
      }
      await capture(p,'10-'+viewer+'-system',10,'TEAM_BUILDING');
    }
    assert.equal(errors.length,0,JSON.stringify(errors));
    fs.writeFileSync(path.join(output,'native-report.json'),JSON.stringify({system,results,errors},null,2));
    fs.writeFileSync(path.join(output,'rendered.json'),JSON.stringify(rendered,null,2));
  }finally{
    const p=await mini.currentPage();if(p.path==='pages/room/room')await p.callMethod('stop');
    for(const [key,value] of storageRecords){
      if(value)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);
    }
    await mini.callWxMethod('removeStorageSync','AVALON_GAME_TOKEN');
    await mini.callWxMethod('removeStorageSync','AVALON_LEGAL_CONSENT');
    await mini.reLaunch('/pages/login/login');
    for(const method of ['login','request','connectSocket'])await mini.restoreWxMethod(method);
    for(const [key,value] of [['AVALON_GAME_TOKEN',saved.token],['AVALON_LEGAL_CONSENT',saved.consent]])if(value)await mini.callWxMethod('setStorageSync',key,value);
    await mini.evaluate(()=>{delete getApp().__identityTableFixture;});mini.disconnect();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
