const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../utils/presentation');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const players = [1,2,3,4,5].map(seatNo => ({ playerId: seatNo + 10, seatNo, nickname: `玩家${seatNo}` }));
const proposal = (id, status = 'APPROVED') => ({
  proposalId: id, missionNo: 1, proposalNo: id, leaderPlayerId: 11,
  leaderSeatNo: 1, leaderNickname: '玩家1', teamPlayerIds: [11,13], status,
  votes: status === 'VOTING' ? [] : [{ seatNo: 1, choice: 'APPROVE' }, { seatNo: 2, choice: 'REJECT' }],
});
const history = ids => ui.liveLogs({ proposals: ids.map(id => proposal(id)) }, players);
function component() {
  let definition;
  vm.runInNewContext(read('components/game-log/game-log.js'), {
    Component: value => { definition = value; },
    require: name => require(path.resolve(root,'components/game-log',name)),
  });
  const c = { data: { ...structuredClone(definition.data), compact: true, replay: false, gameId: 1 }, ...definition.methods };
  c.setData = value => Object.assign(c.data, value);
  c.refresh = (entries, gameId = c.data.gameId) => {
    c.data.entries = entries;
    c.data.gameId = gameId;
    definition.observers['entries,gameId,compact,replay'].call(c, entries, gameId, true, false);
  };
  return c;
}
function roomPage(api) {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {
    require: name => name === '../../services/avalon' ? api
      : name === '../../services/auth' || name === '../../utils/socket' ? {}
        : require(path.resolve(root,'pages/room',name)),
    Page: value => { page=value; }, wx: {}, clearInterval() {},
  });
  page.data=structuredClone(page.data);
  page.setData=value=>Object.assign(page.data,value);
  page.active=true; page.data.roomId=1;
  return page;
}
test('room fetch uses live history and does not change mission drafts during timeline refresh', async () => {
  const timeline={ proposals: [proposal(1,'APPROVED'),proposal(2,'VOTING')], missions: [] };
  const page=roomPage({
    room: async()=>({ roomId:1,currentGameId:1,maxPlayers:5,myPlayerId:11,players }),
    game: async()=>({ gameId:1,phase:'MISSION_EXECUTING',missionNo:1,proposalNo:1,
      onMission:true,evil:true,hasSubmittedMission:false,leaderPlayerId:11,selectedPlayerIds:[11,13] }),
    timeline: async()=>timeline,
    myRole: async()=>({ roleCode:'ASSASSIN',visiblePlayers:[] }),
  });
  await page.fetchState(); page.missionFail(); page.closeMissionOverlay();
  timeline.proposals.push(proposal(3,'VOTING'));
  await page.fetchState();
  assert.deepEqual(page.data.entries.map(p=>p.proposalId),[1]);
  assert.equal(page.data.missionChoice,'FAIL'); assert.equal(page.data.missionOverlayOpen,false);
});
test('settlement renders complete identity response even when departed participant is absent from room players', async () => {
  const identities=players.map(p=>({ ...p,avatarUrl:p.playerId===15?'https://images.example/left.png':null,
    roleName:'忠臣',alignment:'GOOD',isBot:false }));
  const page=roomPage({
    room: async()=>({ roomId:1,currentGameId:1,maxPlayers:5,myPlayerId:11,players:players.slice(0,4),testGame:true }),
    game: async()=>({ gameId:1,phase:'FINISHED',identities }),
    timeline: async()=>({ proposals:[],missions:[] }),
    myRole: async()=>({ roleCode:'LOYAL_SERVANT',visiblePlayers:[] }),
  });
  await page.fetchState();
  assert.equal(page.data.room.players.length,4);
  assert.equal(page.data.finishedIdentities.length,5);
  assert.equal(page.data.finishedIdentities.at(-1).avatarUrl,'https://images.example/left.png');
  assert.equal(page.data.room.players.some(p=>'roleName' in p || 'alignment' in p),false);
});
test('live logs include only APPROVED/REJECTED while replay keeps VOTING and unknown proposals', () => {
  const timeline = { proposals: [proposal(1,'APPROVED'),proposal(2,'REJECTED'),proposal(3,'VOTING'),proposal(4,'FUTURE')] };
  assert.deepEqual(ui.liveLogs(timeline,players).map(p => p.proposalId), [1,2]);
  assert.equal(ui.logs(timeline,players,true).length, 4);
  assert.equal(ui.logs(timeline,players,true)[3].resolved, false);
  assert.equal(timeline.proposals.length, 4);
});
test('compact labels show only team seat numbers without changing full replay labels', () => {
  const item = history([1])[0];
  assert.equal(item.teamSeatText, '1 · 3');
  assert.equal(item.leaderText, '1号 玩家1');
  assert.equal(item.teamText, '1 玩家1 · 3 玩家3');
});
test('live task history publishes completed summaries only, never participant FAIL actions or Lady results', () => {
  const timeline = { proposals: [proposal(1)], missions: [{
    mission: { approvedProposalId: 1, status: 'FAILED', successCount: 1, failCount: 1 },
    actions: [{ gamePlayerId: 11, choice: 'FAIL' }],
  }], ladyActions: [{ sequenceNo: 1, resultAlignment: 'EVIL' }] };
  const item = ui.liveLogs(timeline,players)[0];
  assert.equal(item.mission.failCount, 1);
  assert.deepEqual(item.actions, []);
  assert.equal(item.ladyText, '');
  timeline.missions[0].mission.status = 'EXECUTING';
  assert.equal(ui.liveLogs(timeline,players)[0].mission, null);
  assert.equal(ui.logs(timeline,players,true)[0].actions.length, 1);
});
for (const ids of [[1], [1,2,3]]) {
  test(`${ids.length} resolved records default to newest proposal`, () => {
    const c = component(); c.refresh(history(ids));
    assert.equal(c.data.historyIndex, ids.length - 1);
    assert.equal(c.data.currentProposalId, ids.at(-1));
  });
}
test('swiping updates stable proposal ID and same-history websocket refresh preserves browsing', () => {
  const c = component(); c.refresh(history([1,2,3,4,5]));
  c.historyChange({ detail: { current: 2 } });
  assert.equal(c.data.currentProposalId, 3);
  c.refresh(history([1,2,3,4,5]));
  assert.equal(c.data.currentProposalId, 3);
  assert.equal(c.data.historyIndex, 2);
});
test('new resolved proposal follows latest only when viewer was already viewing latest', () => {
  const c = component(); c.refresh(history([1,2,3])); c.refresh(history([1,2,3,4]));
  assert.equal(c.data.currentProposalId, 4);
  assert.equal(c.data.historyIndex, 3);
  c.historyChange({ detail: { current: 1 } }); c.refresh(history([1,2,3,4,5]));
  assert.equal(c.data.currentProposalId, 2);
  assert.equal(c.data.historyIndex, 1);
});
test('proposal ID survives shifted indexes, not merely saved numeric index', () => {
  const c = component(); c.refresh(history([2,3,4])); c.historyChange({ detail: { current: 0 } });
  c.refresh(history([1,2,3,4,5]));
  assert.equal(c.data.currentProposalId, 2);
  assert.equal(c.data.historyIndex, 1);
});
test('VOTING or unknown proposal arriving does not change live carousel', () => {
  const c = component(); c.refresh(history([1,2,3])); c.historyChange({ detail: { current: 0 } });
  c.refresh([...history([1,2,3]),proposal(4,'VOTING'),proposal(5,'FUTURE')]);
  assert.equal(c.data.currentProposalId, 1);
  assert.equal(c.data.liveEntries.length, 3);
});
test('game ID change resets browsing and closes old all-history overlay even with reused proposal ID', () => {
  const c = component(); c.refresh(history([1,2,3])); c.historyChange({ detail: { current: 0 } }); c.openAllHistory();
  c.refresh(history([1,2]),2);
  assert.equal(c.data.currentProposalId, 2);
  assert.equal(c.data.historyIndex, 1);
  assert.equal(c.data.allHistoryOpen, false);
});
test('zero resolved proposals leave no live history card and no empty placeholder', () => {
  const c = component(); c.refresh([proposal(1,'VOTING')]);
  assert.equal(c.data.liveEntries.length, 0);
  assert.equal(c.data.currentProposalId, null);
  c.openAllHistory(); assert.equal(c.data.allHistoryOpen, false);
  assert.match(read('pages/room/room.wxml'), /wx:if="\{\{board[^}]*entries.length\}\}"/);
  const live = read('components/game-log/game-log.wxml').split('<block wx:if="{{compact && !replay}}">')[1].split('<view wx:else class="log-list">')[0];
  assert.match(live, /wx:if="\{\{liveEntries.length\}\}"/);
  assert.doesNotMatch(live, /组队与任务记录将在这里显示/);
  assert.match(live, /current="\{\{historyIndex\}\}" bindchange="historyChange" circular="\{\{false\}\}"/);
});
test('all-history sheet opens only for multiple resolved entries and survives refresh, closes explicitly', () => {
  const c = component(); c.refresh(history([1])); c.openAllHistory(); assert.equal(c.data.allHistoryOpen,false);
  c.refresh([...history([1,2,3]),proposal(4,'VOTING')]); c.openAllHistory();
  assert.equal(c.data.allHistoryOpen,true);
  assert.equal(JSON.stringify(c.data.allEntries.map(p => p.proposalId)), JSON.stringify([3,2,1]));
  c.refresh([...history([1,2,3,4]),proposal(5,'VOTING')]); assert.equal(c.data.allHistoryOpen,true);
  c.closeAllHistory(); assert.equal(c.data.allHistoryOpen,false);
  const markup = read('components/game-log/game-log.wxml');
  assert.match(markup, /查看全部记录 ›/);
  assert.match(markup, /scroll-view[^>]*scroll-y="\{\{true\}\}"/);
  assert.match(markup, /is="live-proposal-record" data="\{\{item, compact: false\}\}"/);
  assert.match(markup, /wx:if="\{\{replay\}\}"[^>]*wx:for="\{\{item.actions\}\}"/);
  assert.doesNotMatch(read('components/game-log/game-log.js'), /services|triggerEvent\(|wx\.|api\./);
});
test('replay remains full vertical history with secret actions and Lady only behind replay flag', () => {
  assert.match(read('pages/replay/replay.js'), /ui.logs\(replay, replay.players, true\)/);
  assert.match(read('components/game-log/game-log.wxml'), /replay \|\| expanded \|\| index === entries.length - 1/);
  assert.match(read('components/game-log/game-log.wxml'), /replay && item.ladyText/);
  assert.match(read('components/game-log/game-log.wxml'), /replay && item.mission/);
  const finished = read('pages/room/room.wxml').split("game.phase === 'FINISHED'")[1].split('<block wx:else>')[0];
  assert.doesNotMatch(finished, /<game-log/);
});
test('finished identity decorations preserve avatars and snapshots, use bot/initial fallbacks, and sort seats', () => {
  const rows = [
    { playerId: 3,seatNo: 3,nickname: '🦉超长昵称',avatarUrl: null,alignment: 'GOOD' },
    { playerId: 2,seatNo: 2,nickname: '测试机器人',isBot: true,avatarUrl: null,alignment: 'EVIL' },
    { playerId: 1,seatNo: 1,nickname: 'Arrebol',avatarUrl: 'https://images.example/a.png',alignment: 'GOOD' },
  ];
  const result = ui.finishedIdentities(rows);
  assert.deepEqual(result.map(p => p.seatNo), [1,2,3]);
  assert.equal(result[0].avatarUrl, rows[2].avatarUrl);
  assert.equal(result[1].initial, '机'); assert.equal(result[2].initial, '🦉');
  assert.equal(rows[0].seatNo, 3);
});
test('settlement grid keeps avatar seat nickname and right-aligned role in one row', () => {
  const markup = read('pages/room/room.wxml');
  const identity = markup.split('class="identity-row">')[1].split('</view>\n    </view>')[0];
  for (const text of ['identity-avatar','item.avatarUrl','aspectFill','item.initial','identity-seat','item.seatNo','identity-nickname','item.nickname','identity-role','item.roleName'])
    assert.ok(identity.includes(text), text);
  assert.match(identity, /item.alignment === 'GOOD' \? 'good' : 'evil'/);
  // Text nodes must not contain leading newlines that displace the visible role glyphs.
  assert.match(identity, /class="identity-role[^>]*">\{\{item.roleName\}\}<\/text>/);
  const css = read('pages/room/room.wxss');
  assert.match(css, /grid-template-columns: 68rpx minmax\(0, 1fr\) max-content/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /\.identity-role \{[^}]*white-space: nowrap[^}]*text-align: right/);
  assert.match(css, /\.identity-list \{\s*margin-top: 36rpx/);
  assert.match(css, /\.finish-actions \{\s*margin-top: 56rpx/);
  for (const count of [5,6,7,8,9,10]) for (const width of [375,390,430]) {
    // Independent avatar, seat label and longest role remain visible; only nickname truncates.
    const scale = width / 750;
    const inner = width - (2 * 38 + 2 * 24) * scale - 2;
    const fixedColumns = (68 + 2 * 16 + 4 * 23 + 6 * 23) * scale;
    assert.ok(inner > fixedColumns, `${count} players at ${width}px`);
  }
});
