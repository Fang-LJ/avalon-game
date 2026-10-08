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
const roomMarkup = read('pages/room/room.wxml');
// Extract the center blocks, not the independent footer controls.
const boardMarkup = roomMarkup.split('class="card board-center">')[1].split('</view>\n    </view>')[0];
const centerPhase = phase => boardMarkup.split(`game.phase === '${phase}'`)[1].split('</block>')[0];
function logComponent() {
  let definition;
  vm.runInNewContext(read('components/game-log/game-log.js'), {
    Component: value => { definition=value; },
    require: name => require(path.resolve(root,'components/game-log',name)),
  });
  const c={data:{...structuredClone(definition.data),gameId:1,compact:true,replay:false},...definition.methods};
  c.setData=value=>Object.assign(c.data,value);
  c.refresh=entries=>definition.observers['entries,gameId,compact,replay'].call(c,entries,1,true,false);
  return c;
}
function pageAt() {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {
    Page:value=>{page=value;},
    require:name=>/services|socket/.test(name)?{}:require(path.resolve(root,'pages/room',name)),
  });
  page.data=structuredClone(page.data); page.setData=value=>Object.assign(page.data,value);
  return page;
}
function entry({status='APPROVED',success=3,fail=2,missionStatus='FAILED',id=1}={}) {
  return {proposalId:id,missionNo:4,proposalNo:1,status,statusText:status==='APPROVED'?'组队通过':'组队否决',
    leaderText:'5号 很长很长很长的机器人昵称',teamSeatText:'2 · 5 · 7',approveText:'2 3 4 5',rejectText:'1 6 7',
    mission:{missionNo:4,successCount:success,failCount:fail,status:missionStatus},
    actions:[{gamePlayerId:91,choice:'FAIL'}]};
}

test('TEAM_VOTING uses completed IDs only, same green tick regardless of vote choice', () => {
  const game={phase:'TEAM_VOTING',votedPlayerIds:[12,16],votes:[{playerId:12,choice:'APPROVE'},{playerId:16,choice:'REJECT'}]};
  assert.equal(ui.actionDone(game,12),true); assert.equal(ui.actionDone(game,16),true);
  assert.equal(ui.actionDone(game,13),false);
  game.votes.reverse(); assert.equal(ui.actionDone(game,12),true);
  const badge=read('components/player-seat/player-seat.wxml').match(/<text wx:if="\{\{player.actionDone\}\}"[^>]*>✓<\/text>/)[0];
  assert.match(badge,/class="seat-badge action-done-icon"/);
  assert.doesNotMatch(badge,/choice|APPROVE|REJECT|SUCCESS|FAIL/);
});
test('MISSION_EXECUTING marks submitted team members only, never inferring SUCCESS or FAIL', () => {
  const game={phase:'MISSION_EXECUTING',selectedPlayerIds:[12,13,14],missionSubmittedPlayerIds:[12,14,16]};
  for (const [id,expected] of [[12,true],[13,false],[14,true],[16,false],[17,false]])
    assert.equal(ui.actionDone(game,id),expected);
});
test('all other phases clear completion ticks even if stale ID lists are present', () => {
  for (const phase of ['ROLE_CONFIRM','TEAM_BUILDING','LADY_OF_LAKE','ASSASSINATION','FINISHED','WAITING'])
    assert.equal(ui.actionDone({phase,votedPlayerIds:[12],missionSubmittedPlayerIds:[12],selectedPlayerIds:[12]},12),false);
  assert.equal(ui.actionDone(null,12),false);
  assert.equal(ui.actionDone({phase:'TEAM_VOTING'},12),false);
  assert.equal(ui.actionDone({phase:'MISSION_EXECUTING',selectedPlayerIds:[12]},12),false);
});
test('room merges stage completion locally and never mutates public players or role vision', () => {
  const page=pageAt(), players=[1,2,3].map(seatNo=>({playerId:seatNo,seatNo,nickname:`玩家${seatNo}`,me:seatNo===1}));
  page.setData({room:{players,maxPlayers:7},game:{phase:'TEAM_VOTING',leaderPlayerId:1,votedPlayerIds:[1,2]},
    selectedIds:[1,2],role:{visiblePlayers:[{playerId:2,knowledgeType:'MERLIN_OR_MORGANA',hint:'梅林或莫甘娜'}]}});
  page.decoratePlayers();
  assert.deepEqual(plain(page.data.displayPlayers.map(p=>p.actionDone)),[true,true,false]);
  assert.equal(page.data.displayPlayers[0].leader,true); assert.equal(page.data.displayPlayers[0].selected,true);
  assert.equal(page.data.displayPlayers[1].knowledgeSymbol,'?');
  for (const p of players) assert.equal('actionDone' in p || 'role' in p || 'alignment' in p || 'knowledgeType' in p,false);
  page.data.game.phase='TEAM_BUILDING'; page.decoratePlayers();
  assert.ok(page.data.displayPlayers.every(p=>p.actionDone===false));
});
test('voting center keeps personal status but removes counts and incomplete player lists', () => {
  const center=centerPhase('TEAM_VOTING');
  assert.match(center,/是否同意这支队伍/); assert.match(center,/队伍：/);
  assert.match(center,/game.hasVoted \? '已投票，等待其他玩家' : '请投票'/);
  assert.doesNotMatch(center,/voteCount|playerCount|未投票|未完成|approveText|rejectText/);
  assert.match(roomMarkup,/bindtap="approve"/); assert.match(roomMarkup,/bindtap="reject"/);
});
test('mission center distinguishes pending submitted and bystander without old vote results', () => {
  const center=centerPhase('MISSION_EXECUTING');
  for (const text of ['任务执行中','请做任务','已完成任务，等待其他任务成员','等待任务成员完成'])
    assert.ok(center.includes(text),text);
  assert.match(center,/!game.onMission \? '等待任务成员完成' : game.hasSubmittedMission/);
  assert.doesNotMatch(center,/组队通过|同意|反对|voteResult|Count|未完成/);
  for (const text of ['执行秘密任务','已秘密提交 · 等待其他任务成员','等待任务成员提交','<mission-card-overlay'])
    assert.ok(roomMarkup.includes(text),text);
});
test('leader actionDone self knowledge and selection each retain their independent visual layer', () => {
  const markup=read('components/player-seat/player-seat.wxml'),css=read('components/player-seat/player-seat.wxss');
  for (const name of ['leader-icon','action-done-icon','knowledge-icon','me-icon','player.selectionClass'])
    assert.ok(markup.includes(name));
  const done=css.match(/\.action-done-icon \{([^}]+)\}/)[1];
  assert.match(done,/top: -5rpx/); assert.match(done,/right: -5rpx/); assert.match(done,/background: var\(--good\)/);
  assert.doesNotMatch(done,/APPROVE|REJECT|FAIL|SUCCESS/);
  assert.match(css,/box-sizing: border-box/);
  assert.match(css,/\.formal.compact \.action-done-icon \{ right: -9rpx/);
  // Reserve the avatar border as well as the full badge boxes at the smallest size.
  for (const width of [84,96,100,112]) assert.ok(width/2+15<width-4+(width===84?9:5)-30);
});
test('live proposal template is a two-column card with status beside title and images below', () => {
  const markup=read('components/game-log/game-log.wxml');
  const live=markup.split('<template name="live-proposal-record">')[1].split('</template>')[0];
  const heading=live.split('class="proposal-heading">')[1].split('class="proposal-columns">')[0];
  assert.match(heading,/log-title/); assert.match(heading,/proposal-status/);
  const left=live.split('class="proposal-team">')[1].split('class="proposal-votes">')[0];
  assert.match(left,/队长：/); assert.match(left,/队伍：/); assert.doesNotMatch(left,/同意|反对/);
  const right=live.split('class="proposal-votes">')[1].split('class="proposal-mission">')[0];
  assert.match(right,/同意：/); assert.match(right,/反对：/);
  assert.match(live,/<image wx:for="\{\{item.missionCards\}\}"/);
  assert.match(live,/mode="aspectFit"/); assert.doesNotMatch(live,/SUCCESS ×|FAIL ×|item.actions|<play-card/);
  const css=read('components/game-log/game-log.wxss');
  assert.match(css,/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css,/\.history-swiper \{ height: 244rpx/);
  assert.match(css,/\.history-swiper.without-mission \{ height: 156rpx/);
});
test('live carousel and all-history reuse identical anonymous success-first thumbnail data', () => {
  const c=logComponent(), input=entry(); c.refresh([input]);
  assert.deepEqual(plain(c.data.liveEntries[0].missionCards.map(card=>card.src)),
    [CARDS.actions.SUCCESS,CARDS.actions.SUCCESS,CARDS.actions.SUCCESS,CARDS.actions.FAIL,CARDS.actions.FAIL]);
  assert.deepEqual(plain(c.data.allEntries[0].missionCards),plain(c.data.liveEntries[0].missionCards));
  assert.ok(c.data.liveEntries[0].missionCards.every(card=>Object.keys(card).join(',')==='index,src'));
  assert.equal(input.missionCards,undefined);
  const markup=read('components/game-log/game-log.wxml');
  assert.match(markup,/is="live-proposal-record" data="\{\{item, compact: true\}\}"/);
  assert.match(markup,/is="live-proposal-record" data="\{\{item, compact: false\}\}"/);
});
test('rejected executing absent and malformed missions never show thumbnail results', () => {
  const c=logComponent();
  for (const input of [entry({status:'REJECTED'}),entry({missionStatus:'EXECUTING'}),
    {...entry(),mission:null},entry({success:99}),entry({fail:-1})]) {
    c.refresh([input]); assert.equal(c.data.liveEntries[0].missionCards.length,0);
  }
});
test('fourth-mission success with a FAIL keeps success title and still renders the failure card', () => {
  const c=logComponent(); c.refresh([entry({success:3,fail:1,missionStatus:'SUCCESS'})]);
  assert.equal(c.data.liveEntries[0].mission.status,'SUCCESS');
  assert.equal(c.data.liveEntries[0].missionCards.at(-1).src,CARDS.actions.FAIL);
});
test('52rpx thumbnails retain original ratio and five cards fit 375 390 430px', () => {
  const css=read('components/game-log/game-log.wxss');
  assert.match(css,/width: 52rpx; height: 72.28rpx/); assert.match(css,/gap: 8rpx/);
  assert.ok(Math.abs(52/72.28-600/834)<0.0001);
  for (const width of [375,390,430]) {
    const scale=width/750;
    assert.ok((5*52+4*8+16+4*21)*scale<(750-2*38-2*20)*scale-2);
  }
});
test('Replay retains complete text actions and Lady information behind its existing flags', () => {
  const replay=read('components/game-log/game-log.wxml').split('<template name="proposal-record">')[1].split('</template>')[0];
  assert.match(replay,/SUCCESS ×/); assert.match(replay,/FAIL ×/);
  assert.match(replay,/replay && item.ladyText/); assert.match(replay,/wx:for="\{\{item.actions\}\}"/);
  assert.match(replay,/wx:if="\{\{replay\}\}"/);
});
test('result overlay removes redundant wording and totals without changing animation state machine', () => {
  const markup=read('components/mission-result-overlay/mission-result-overlay.wxml');
  assert.doesNotMatch(markup,/匿名揭晓|不对应玩家座位|任务结果已揭晓|result-note|result-summary|成功 \{\{successCount\}\}/);
  assert.match(markup,/wx:if="\{\{stage !== 'RESULT'\}\}" class="result-step"/);
  for (const text of ['任务牌已收齐','正在混洗任务牌','准备揭晓任务牌','正在揭晓任务牌','确认结果'])
    assert.ok(markup.includes(text));
  assert.match(markup,/status === 'SUCCESS' \? '成功' : '失败'/);
  assert.match(markup,/<play-card size="result"/);
});
