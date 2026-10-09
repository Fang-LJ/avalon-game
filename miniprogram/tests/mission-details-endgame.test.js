const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const { CARDS } = require('../utils/cards');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function definition(file) {
  let result;
  vm.runInNewContext(read(file), { Component: value => {result=value;}, Page: value => {result=value;},
    require: name => /services|socket/.test(name) ? {} : require(path.resolve(root,path.dirname(file),name)),
    wx:{ showToast:value=>{result.toast=value;} },
  });
  return result;
}
function pageAt() {
  const page = definition('pages/room/room.js');
  page.data=structuredClone(page.data);page.setData=value=>Object.assign(page.data,value);
  return page;
}
const players=[1,2,3,4,5,6,7].map(n=>({playerId:n+10,seatNo:n,nickname:`玩家${n}`,me:n===1}));
const proposal=(id,missionNo,status='APPROVED')=>({proposalId:id,missionNo,proposalNo:id,leaderPlayerId:11,
  leaderNickname:'玩家1',leaderSeatNo:1,teamPlayerIds:[11,12,13],status,
  votes:[{seatNo:1,choice:'APPROVE'},{seatNo:2,choice:'REJECT'}],
  actions:[{gamePlayerId:12,choice:'FAIL'}],ladyText:'EVIL'});
const timeline={proposals:[proposal(1,1),proposal(2,2,'REJECTED'),proposal(3,2,'REJECTED'),proposal(4,2)],
  missions:[{missionNo:1,approvedProposalId:1,status:'SUCCESS',successCount:3,failCount:0},
    {missionNo:2,approvedProposalId:4,status:'FAILED',successCount:2,failCount:1}],
  ladyActions:[{resultAlignment:'EVIL'}]};

test('mission-track emits only SUCCESS/FAILED with current trusted dot status, never queries APIs',()=>{
  const d=definition('components/mission-track/mission-track.js');
  const c={data:{},setData:v=>Object.assign(c.data,v),events:[],triggerEvent:(...args)=>c.events.push(args),...d.methods};
  d.observers['missions,current'].call(c,timeline.missions,3);
  for(const n of [1,2,3,4,5,99])c.missionTap({currentTarget:{dataset:{missionNo:n}}});
  assert.deepEqual(plain(c.events),[['missiontap',{missionNo:1,status:'SUCCESS'}],['missiontap',{missionNo:2,status:'FAILED'}]]);
  assert.doesNotMatch(read('components/mission-track/mission-track.js'),/request|services|proposal|showModal/);
  assert.match(read('components/mission-track/mission-track.wxml'),/item.completed \? 'dot-pressed' : 'none'/);
});
test('task detail follows missionNo then approvedProposalId, excludes rejected proposals and all secret fields',()=>{
  const snapshot=JSON.stringify(timeline),detail=ui.missionDetail(timeline,players,2);
  assert.equal(detail.proposalId,4);assert.equal(detail.missionNo,2);assert.equal(detail.proposalNo,4);
  assert.equal(detail.leaderText,'1号 玩家1');assert.equal(detail.teamSeatText,'1 · 2 · 3');
  assert.equal(detail.approveText,'1');assert.equal(detail.rejectText,'2');
  assert.deepEqual(detail.cards.map(c=>c.src),[CARDS.actions.SUCCESS,CARDS.actions.SUCCESS,CARDS.actions.FAIL]);
  for(const field of ['actions','ladyActions','ladyText','role','roleCode','alignment','gamePlayerId'])
    assert.ok(!JSON.stringify(detail).includes(`"${field}"`),field);
  assert.equal(JSON.stringify(timeline),snapshot);
  assert.equal(ui.missionDetail(timeline,players,1).proposalId,1);
});
test('task detail safely rejects missing mismatched rejected pending or invalid mission data',()=>{
  assert.equal(ui.missionDetail(null,players,1),null);
  assert.equal(ui.missionDetail(undefined,players,1),null);
  for(const n of [0,3,6,NaN])assert.equal(ui.missionDetail(timeline,players,n),null);
  for(const mutate of [
    t=>{t.proposals=[];},t=>{t.proposals.at(-1).status='REJECTED';},
    t=>{t.proposals.at(-1).missionNo=1;},t=>{t.missions[1].status='EXECUTING';},
    t=>{t.missions[1].successCount=99;},
  ]){const t=structuredClone(timeline);mutate(t);assert.equal(ui.missionDetail(t,players,2),null);}
});
test('task detail is UI-only, opens in five formal phases and closes without mutating game or timeline',()=>{
  for(const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE','ASSASSINATION']){
    const p=pageAt(),game={gameId:1,phase};p.setData({room:{players},game,timeline});
    p.openMissionDetail({detail:{missionNo:2,status:'SUCCESS'}});
    assert.equal(p.data.missionDetail.status,'FAILED','trust timeline, not emitted status');
    p.closeMissionDetail();assert.equal(p.data.missionDetail,null);
    assert.equal(p.data.game,game);assert.equal(p.data.timeline,timeline);
  }
});
test('result reveal blocks history detail, ROLE_CONFIRM/FINISHED disallow it and missing records toast safely',()=>{
  const p=pageAt();p.setData({room:{players},game:{phase:'TEAM_BUILDING'},timeline});
  p.data.missionResultOpen=true;p.openMissionDetail({detail:{missionNo:1}});assert.equal(p.data.missionDetail,null);
  p.data.missionResultOpen=false;
  for(const phase of ['ROLE_CONFIRM','FINISHED']){p.data.game.phase=phase;p.openMissionDetail({detail:{missionNo:1}});assert.equal(p.data.missionDetail,null);}
  p.data.game.phase='TEAM_BUILDING';p.openMissionDetail({detail:{missionNo:3}});
  assert.equal(p.toast.title,'任务记录暂不可用');assert.equal(p.data.missionDetail,null);
});
test('overlay mask and close button dismiss, card stops bubbling, size/layer leave room for result reveal',()=>{
  const d=definition('components/mission-detail-overlay/mission-detail-overlay.js'),events=[];
  const c={triggerEvent:name=>events.push(name)};d.methods.ignoreTap.call(c);assert.equal(events.length,0);
  d.methods.close.call(c);assert.deepEqual(events,['close']);
  const w=read('components/mission-detail-overlay/mission-detail-overlay.wxml'),css=read('components/mission-detail-overlay/mission-detail-overlay.wxss');
  assert.match(w,/mission-detail-mask" catchtap="close"/);assert.match(w,/mission-detail-card" catchtap="ignoreTap"/);
  assert.match(w,/detail-close"[^>]*bindtap="close"/);assert.match(w,/<scroll-view/);
  assert.doesNotMatch(w,/actions|gamePlayerId|choice|lady|roleCode/);
  assert.match(css,/width: 88vw; max-height: 76vh/);assert.match(css,/z-index: 80/);
  assert.match(read('components/mission-result-overlay/mission-result-overlay.wxss'),/z-index: 100/);
});
for(const type of ['EVIL','EVIL_ALLY'])test(`${type} uses shared CSS crescent, not white dot, emoji or role`,()=>{
  const view=ui.privateKnowledge({knowledgeType:type});assert.equal(view.knowledgeSymbol,'');assert.equal(view.knowledgeClass,'knowledge-evil');
  const w=read('components/knowledge-mark/knowledge-mark.wxml'),css=read('components/knowledge-mark/knowledge-mark.wxss');
  assert.match(w,/type === 'EVIL' \|\| type === 'EVIL_ALLY'/);assert.match(w,/evil-crescent/);assert.match(w,/crescent-cutout/);
  assert.doesNotMatch(w,/●|☾|🌙|type === 'ASSASSIN'|type === 'MORGANA'/);assert.match(css,/right: -18%/);
  for(const file of ['components/player-seat/player-seat.wxml','pages/room/room.wxml','components/card-deal-stage/card-deal-stage.wxml'])assert.match(read(file),/<knowledge-mark type=/);
});
test('Percival candidates are identical question marks and all private markers remain client-local',()=>{
  const a=ui.privateKnowledge({playerId:12,knowledgeType:'MERLIN_OR_MORGANA'}),b=ui.privateKnowledge({playerId:13,knowledgeType:'MERLIN_OR_MORGANA'});
  assert.equal(a.knowledgeSymbol,'?');assert.equal(b.knowledgeSymbol,'?');assert.equal(a.knowledgeClass,b.knowledgeClass);
  const p=pageAt();p.setData({room:{players,maxPlayers:7},game:{phase:'TEAM_BUILDING'},role:{visiblePlayers:[{playerId:12,knowledgeType:'EVIL'}]}});
  p.decoratePlayers();assert.equal(p.data.displayPlayers.find(v=>v.playerId===12).knowledgeType,'EVIL');
  assert.ok(players.every(v=>!('knowledgeType' in v)&&!('roleCode' in v)&&!('alignment' in v)));
});
test('hasVoted covers own stale ID list only; peers still depend on the public completion list',()=>{
  const game={phase:'TEAM_VOTING',hasVoted:true,votedPlayerIds:[]};
  assert.equal(ui.actionDone(game,{playerId:11,me:true}),true);
  assert.equal(ui.actionDone(game,{playerId:12,me:false}),false);
  assert.equal(ui.actionDone(game,11),false);
  game.votedPlayerIds=[12];assert.equal(ui.actionDone(game,{playerId:12,me:false}),true);
  game.hasVoted=false;assert.equal(ui.actionDone(game,{playerId:11,me:true}),false);
});
test('hasSubmittedMission covers own task only, never outsiders or other players',()=>{
  const game={phase:'MISSION_EXECUTING',hasSubmittedMission:true,selectedPlayerIds:[11,12],missionSubmittedPlayerIds:[]};
  assert.equal(ui.actionDone(game,{playerId:11,me:true}),true);
  assert.equal(ui.actionDone(game,{playerId:12,me:false}),false);
  assert.equal(ui.actionDone(game,{playerId:13,me:true}),false);
  game.missionSubmittedPlayerIds=[12,13];assert.equal(ui.actionDone(game,{playerId:12}),true);
  assert.equal(ui.actionDone(game,{playerId:13}),false);
  for(const phase of ['WAITING','ROLE_CONFIRM','TEAM_BUILDING','LADY_OF_LAKE','ASSASSINATION','FINISHED'])assert.equal(ui.actionDone({...game,phase},{playerId:11,me:true}),false);
});
test('room actually passes me to fallback and never sets an optimistic completion tick on vote/task click',()=>{
  const p=pageAt();p.setData({room:{players,maxPlayers:7},game:{phase:'TEAM_VOTING',hasVoted:true,votedPlayerIds:[]}});p.decoratePlayers();
  assert.deepEqual(plain(p.data.displayPlayers.map(v=>v.actionDone)),[true,false,false,false,false,false,false]);
  p.data.game={phase:'MISSION_EXECUTING',hasSubmittedMission:true,selectedPlayerIds:[11,12]};p.decoratePlayers();
  assert.deepEqual(plain(p.data.displayPlayers.map(v=>v.actionDone)),[true,false,false,false,false,false,false]);
  const s=read('pages/room/room.js');assert.match(s,/actionDone: ui.actionDone\(game, player\)/);
  assert.doesNotMatch(s,/actionDone:\s*true/);
});
const identities=[
  {playerId:3,seatNo:3,nickname:'忠臣',roleCode:'LOYAL_SERVANT',roleName:'梅林',alignment:'GOOD'},
  {playerId:1,seatNo:1,nickname:'头像',avatarUrl:'https://images.example/a.png',roleCode:'MERLIN',roleName:'改名也不影响强调',alignment:'GOOD'},
  {playerId:4,seatNo:4,nickname:'坏人',roleCode:'MORGANA',alignment:'EVIL'},
  {playerId:2,seatNo:2,nickname:'派西',roleCode:'PERCIVAL',alignment:'GOOD'},
];
for(const winner of ['GOOD','EVIL',null])test(`settlement ${winner||'HOST_ENDED'} sorts winner first, seats within camps and uses roleCode`,()=>{
  const groups=ui.finishedGroups(identities,winner),expected=winner==='EVIL'?['EVIL','GOOD']:['GOOD','EVIL'];
  assert.deepEqual(groups.map(g=>g.alignment),expected);
  assert.deepEqual(groups.find(g=>g.alignment==='GOOD').players.map(p=>p.seatNo),[1,2,3]);
  assert.equal(groups.filter(g=>g.winner).length,winner?1:0);
  assert.equal(groups.find(g=>g.alignment==='GOOD').players[0].avatarUrl,identities[1].avatarUrl);
  assert.deepEqual(ui.finishedIdentities(identities).map(p=>p.roleClass),['role-merlin','role-percival','','']);
  assert.equal(identities[0].roleClass,undefined);
});
test('settlement has restrained separate cyan/red camps, gold Merlin/lavender Percival and unchanged global good',()=>{
  const css=read('pages/room/room.wxss'),w=read('pages/room/room.wxml');
  assert.match(w,/wx:for="\{\{finishedGroups\}\}"/);assert.match(w,/group.winner \? ' · 胜利' : ''/);
  assert.match(css,/\.settlement-good \{ color: #65c7df/);assert.match(css,/\.settlement-evil \{ color: var\(--evil\)/);
  assert.match(css,/\.identity-role.role-merlin \{ color: #f0d58c;[^}]+text-shadow/);
  assert.match(css,/\.identity-role.role-percival \{ color: #c3aeff;[^}]+text-shadow/);
  assert.match(css,/\.identity-role.special-role-tag \{[^}]+border-radius: 999rpx/);
  assert.match(read('app.wxss'),/--good: #46c2a3/);
});
