const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function component(name) {
  let result; vm.runInNewContext(read(`components/${name}/${name}.js`),{Component:value=>{result=value;}});
  return result;
}
function track(missions=[],current=1,teamSizes=ui.rules(6).teamSizes) {
  const c={data:{},setData:value=>Object.assign(c.data,value),events:[],triggerEvent:(...args)=>c.events.push(args)};
  const definition=component('mission-track'); Object.assign(c,definition.methods);
  c.refresh=(missions,current,teamSizes)=>definition.observers['missions,current,teamSizes'].call(c,missions,current,teamSizes);
  c.refresh(missions,current,teamSizes); return c;
}
function pageAt(api={}) {
  let page; vm.runInNewContext(read('pages/room/room.js'),{
    Page:value=>{page=value;},require:name=>name==='../../services/avalon'?api
      : /services\/auth|utils\/socket/.test(name)?{} : require(path.resolve(root,'pages/room',name)),
    wx:{},clearInterval(){},
  });
  page.data=structuredClone(page.data); page.setData=value=>Object.assign(page.data,value); page.active=true;
  const room={roomId:7,maxPlayers:6,myPlayerId:1,players:[1,2,3,4,5,6].map(n=>({playerId:n,seatNo:n,nickname:`玩家${n}`,me:n===1}))};
  page.setData({roomId:7,room,game:{gameId:7,phase:'TEAM_VOTING',missionNo:1,proposalNo:5,
    consecutiveRejections:4,maxRejections:5,selectedPlayerIds:[1,2],leaderPlayerId:1,hasVoted:false}});
  return page;
}
for(const [count,sizes] of [[5,[2,3,2,3,3]],[6,[2,3,4,3,4]],[7,[2,3,3,4,4]],
  [8,[3,4,4,5,5]],[9,[3,4,4,5,5]],[10,[3,4,4,5,5]]]) {
  test(`${count} players use one existing rule table for all five task labels`,()=>{
    assert.deepEqual(ui.rules(count).teamSizes,sizes);
    assert.equal(ui.rules(count).teamText,sizes.join(' / '));
    assert.deepEqual(plain(track([],1,ui.rules(count).teamSizes).data.dots.map(dot=>dot.label)),sizes);
    const copy=ui.rules(count).teamSizes; copy[0]=99; assert.deepEqual(ui.rules(count).teamSizes,sizes,'UI caller cannot mutate shared rules');
  });
}
test('six-player track changes 2 3 4 3 4 to success then success/fail without substituting round number',()=>{
  const c=track();
  c.refresh([{missionNo:1,status:'SUCCESS'}],2,ui.rules(6).teamSizes);
  assert.deepEqual(plain(c.data.dots.map(d=>d.label)),['✓',3,4,3,4]);
  c.refresh([{missionNo:1,status:'SUCCESS'},{missionNo:2,status:'FAILED'}],3,ui.rules(6).teamSizes);
  assert.deepEqual(plain(c.data.dots.map(d=>d.label)),['✓','×',4,3,4]);
  assert.deepEqual(plain(c.data.dots.map(d=>d.status)),['SUCCESS','FAILED','CURRENT','PENDING','PENDING']);
  for(const n of [1,2,3,4,5])c.missionTap({currentTarget:{dataset:{missionNo:n}}});
  assert.deepEqual(plain(c.events),[['missiontap',{missionNo:1,status:'SUCCESS'}],['missiontap',{missionNo:2,status:'FAILED'}]]);
});
test('unfinished mission rows keep current/future colors and task sizes, absent rules do not invent rules',()=>{
  const c=track([{missionNo:3,status:'EXECUTING'},{missionNo:4,status:'EXECUTING'}],3);
  assert.equal(c.data.dots[2].status,'CURRENT'); assert.equal(c.data.dots[2].label,4);
  assert.equal(c.data.dots[3].status,'PENDING'); assert.equal(c.data.dots[3].label,3);
  c.refresh([],3,[]); assert.ok(c.data.dots.every(d=>d.label==='–'));
  c.refresh([],3,[NaN,-1,99,2.5,null]); assert.ok(c.data.dots.every(d=>d.label==='–'));
  assert.doesNotMatch(read('components/mission-track/mission-track.js'),/5:\s*\[|6:\s*\[|7:\s*\[/);
  assert.match(read('pages/room/room.wxml'),/teamSizes="\{\{rule.teamSizes\}\}"/);
  assert.match(read('components/mission-track/mission-track.wxss'),/width: 48rpx;\s*height: 48rpx/);
  assert.match(read('components/mission-track/mission-track.wxss'),/\.CURRENT,\s*\.PENDING \{\s*font-size: 24rpx/);
  assert.doesNotMatch(read('components/mission-track/mission-track.wxss').match(/\.dot \{([^}]+)\}/)[1],/font-size:/,'completed symbols retain their inherited original size');
});
for(const count of [0,1,2,3,4,5]) {
  test(`${count}/5 rejection state has five dots, warning only at four`,()=>{
    const game={consecutiveRejections:count,maxRejections:5,proposalNo:99};
    const before=JSON.stringify(game),state=ui.rejectionState(game);
    assert.deepEqual(state.dots,Array.from({length:5},(_,i)=>i<count));
    assert.equal(state.forced,count===4); assert.equal(JSON.stringify(game),before);
  });
}
test('forced warning uses consecutiveRejections and server max, never proposalNo or a new rule',()=>{
  assert.equal(ui.rejectionState({consecutiveRejections:0,maxRejections:5,proposalNo:5}).forced,false);
  assert.equal(ui.rejectionState({consecutiveRejections:4,maxRejections:5,proposalNo:2}).forced,true);
  assert.deepEqual(ui.rejectionState({consecutiveRejections:2,maxRejections:3}),{dots:[true,true,false],forced:true});
  for(const game of [null,{}, {maxRejections:NaN},{maxRejections:Infinity},{maxRejections:999}])
    assert.deepEqual(ui.rejectionState(game),{dots:[],forced:false});
  assert.deepEqual(ui.rejectionState({consecutiveRejections:-1,maxRejections:5}).dots,[false,false,false,false,false]);
});
test('fifth proposal still sends REJECT through the existing API; no optimistic pass or phase transition',async()=>{
  const calls=[];const page=pageAt({vote:async(...args)=>{calls.push(args);}});
  page.refreshAfterMutation=async()=>{}; page.decoratePlayers();
  assert.equal(page.data.rejection.forced,true);
  await page.reject(); assert.deepEqual(calls,[[7,'REJECT']]); assert.equal(page.data.game.phase,'TEAM_VOTING');
  assert.equal(page.data.game.hasVoted,false); assert.equal(page.data.game.consecutiveRejections,4);
  const markup=read('pages/room/room.wxml');
  const reject=markup.match(/<button[^>]+bindtap="reject"[^>]*>/)[0];
  assert.match(reject,/disabled="\{\{busy\}\}"/); assert.doesNotMatch(reject,/forced|consecutiveRejections/);
  assert.doesNotMatch(markup,/为当前队长/);
  assert.doesNotMatch(markup.split('<view class="phase-actions actions">')[1],/连续否决|rejection-status/);
});
test('rejection indicators stay inside board center and only team-building/voting display them',()=>{
  const markup=read('pages/room/room.wxml');
  const center=markup.split(/class="card board-center[^\n]*>/)[1].split('</view>\n    </view>')[0];
  assert.match(center,/<block wx:if="\{\{game.phase === 'TEAM_BUILDING' \|\| game.phase === 'TEAM_VOTING'\}\}">\s*<view wx:if="\{\{rejection.forced\}\}"/);
  assert.match(center,/本轮若再次否决，邪恶阵营直接获胜/); assert.match(center,/rejection.dots/);
  const css=read('pages/room/room.wxss');
  assert.match(css,/\.rejection-dot \{ width: 20rpx; height: 20rpx/);
  assert.match(css,/\.rejection-dot.rejected \{ background: var\(--evil\)/);
  assert.match(css,/min-height: 32rpx/);
  for(const phase of ['TEAM_BUILDING','TEAM_VOTING']) {
    const page=pageAt();page.data.game.phase=phase;page.decoratePlayers();assert.equal(page.data.rejection.forced,true);
    page.data.game.consecutiveRejections=0;page.decoratePlayers();assert.equal(page.data.rejection.forced,false);
  }
});
test('assassination evil seats cannot be clicked but do not dim; GOOD target gets amber without mutating public players',()=>{
  const page=pageAt(); page.setData({role:{roleCode:'ASSASSIN',visiblePlayers:[]},
    game:{...page.data.game,phase:'ASSASSINATION',assassin:true,revealedEvilIdentities:[{playerId:1,roleCode:'ASSASSIN'},{playerId:4,roleCode:'OBERON'}]}});
  const before=JSON.stringify(page.data.room.players); page.decoratePlayers();
  for(const id of [1,4]) {
    const p=page.data.displayPlayers.find(p=>p.playerId===id);
    assert.equal(p.unselectable,true); assert.equal(p.dimmed,false); assert.equal(p.disabled,false); assert.equal(p.revealedEvil,true);
    page.togglePlayer({detail:{playerId:id}}); assert.equal(page.data.assassinationTarget,null);
  }
  const good=page.data.displayPlayers.find(p=>p.playerId===2); assert.equal(good.unselectable,false); assert.equal(good.revealedEvil,false);
  page.togglePlayer({detail:{playerId:2}});
  assert.equal(page.data.displayPlayers.find(p=>p.playerId===2).selectionClass,'selected-assassination');
  assert.equal(JSON.stringify(page.data.room.players),before);
  page.setData({selectedIds:[4]});page.decoratePlayers();
  assert.equal(page.data.displayPlayers.find(p=>p.playerId===4).selectionClass,'','evil cannot have an amber target ring even with stale draft');
});
test('player-seat independently gates disabled and unselectable; normal lobby and Lady behavior remain',()=>{
  const def=component('player-seat'),calls=[];
  const c={data:{player:{playerId:1,seatNo:1}},triggerEvent:(...args)=>calls.push(args),...def.methods};
  c.data.player.unselectable=true;c.choose();assert.equal(calls.length,0);
  c.data.player.unselectable=false;c.data.player.disabled=true;c.choose();assert.equal(calls.length,0);
  c.data.player.disabled=false;c.choose();assert.equal(calls.length,1);
  const page=pageAt(); page.setData({game:{...page.data.game,phase:'LADY_OF_LAKE',ladyHolder:true,ladyEligibleTargetIds:[2]}});
  page.decoratePlayers();assert.equal(page.data.displayPlayers.find(p=>p.playerId===1).disabled,true);
  assert.equal(page.data.displayPlayers.find(p=>p.playerId===2).disabled,false);
  assert.ok(page.data.displayPlayers.every(p=>!p.revealedEvil&&!p.unselectable));
  const css=read('components/player-seat/player-seat.wxss');assert.match(css,/\.disabled \{\s*opacity: 0.4/);
  assert.doesNotMatch(read('components/player-seat/player-seat.wxml'),/player.unselectable \? 'disabled'/);
});
test('public evil red ring and selected target amber ring stay static, private identities stay unchanged',()=>{
  const css=read('components/player-seat/player-seat.wxss');
  assert.match(css,/\.revealed-evil-ring \{[^}]*#C85C68/); assert.match(css,/\.selected-assassination \{[^}]*#FFD166/);
  assert.doesNotMatch(css.match(/\.revealed-evil-ring \{([^}]+)\}/)[1],/animation|opacity/);
  assert.match(read('components/player-seat/player-seat.wxml'),/player.revealedEvil \? 'revealed-evil-ring'/);
  for(const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE','FINISHED'])
    assert.deepEqual(ui.assassinationPlayerState({phase,revealedEvilIdentities:[{playerId:4,roleCode:'OBERON'}]}, {playerId:4},1),{revealedEvil:false,unselectable:false,dimmed:false});
});
test('final assassination copy is identical for early and normal, non-assassin has only waiting text',()=>{
  const markup=read('pages/room/room.wxml');
  assert.match(markup,/<view class="evil">最终刺杀<\/view>/);
  assert.match(markup,/刺中梅林，邪恶获胜；刺错则正义获胜/);
  assert.match(markup,/game.assassin \? '请选择刺杀梅林' : '等待刺客选择梅林'/);
  assert.doesNotMatch(markup,/game.assassinationEarly|正义已完成 3 个任务|邪恶最后机会|确认后不可更改/);
});
test('42/36 crowns remain above 38/34 identity marks; 30px tick and self badge fit independently at 375/390/430 widths',()=>{
  const css=read('components/player-seat/player-seat.wxss');
  assert.match(css,/\.leader-icon \{[^}]*top: -16rpx;[^}]*width: 42rpx;\s*height: 42rpx;\s*font-size: 26rpx/);
  assert.match(css,/\.formal.compact .leader-icon \{ width: 36rpx; height: 36rpx; font-size: 23rpx/);
  assert.match(css,/\.knowledge-icon \{[^}]*width: 38rpx;\s*height: 38rpx/);
  assert.match(css,/\.formal.compact .knowledge-icon \{ width: 34rpx; height: 34rpx/);
  assert.match(css,/\.seat-badge \{[^}]*height: 30rpx/);
  assert.match(css,/\.seat-avatar \{[^}]*overflow: visible/);
  for(const screen of [375,390,430])for(const count of [5,6,7,8,9,10]) {
    const scale=screen/750,compact=count>=9,avatar=compact?84:96,crown=compact?36:42,right=compact?9:5;
    const crownRight=(avatar/2+crown/2)*scale,doneLeft=(avatar+right-30)*scale;
    assert.ok(crownRight<doneLeft,'crown and tick boxes must not overlap');
    const boardHeight=compact?900:720;
    const position=ui.seatPosition(1,count,true),percent=Number(position.match(/top:([\d.]+)/)[1]);
    assert.ok((boardHeight*percent/100-16)*scale>0,'seat 1 crown stays below board top');
    const knowledgeWidth=compact?34:38;
    assert.ok(avatar-knowledgeWidth+5>25,'identity and me remain separated');
    assert.ok(avatar-knowledgeWidth+5>25,'identity and done remain separated vertically');
  }
});
