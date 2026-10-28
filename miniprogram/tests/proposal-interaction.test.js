const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rows = ids => ids.map(proposalId => ({ proposalId, missionNo: 1, proposalNo: proposalId,
  status: 'APPROVED', teamPlayerIds: [101, 102], votes: [] }));
function component() {
  let def, serial = 0;
  const timers = new Map();
  vm.runInNewContext(read('components/game-log/game-log.js'), {
    require: name => require(path.resolve(root, 'components/game-log', name)), Component: value => { def = value; },
    setTimeout: callback => { timers.set(++serial, callback); return serial; },
    clearTimeout: id => timers.delete(id),
  });
  const c = { data: { ...structuredClone(def.data), night:true, compact:true, replay:false, gameId:1, maxPlayers:8,
    players:Array.from({length:8},(_,i)=>({playerId:101+i,seatNo:i+1})) }, ...def.methods, updates:[] };
  c.setData = value => { c.updates.push(value); Object.assign(c.data, value); };
  c.refresh = (entries, gameId = 1) => {
    Object.assign(c.data,{entries,gameId});
    def.observers['entries,gameId,compact,replay,maxMissionSlots'].call(c,entries,gameId,true,false,5);
  };
  c.flushTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  c.detach = () => def.lifetimes.detached.call(c);
  c.timers = timers;
  return c;
}
for (const count of [1,2,5]) test(`${count} cards: identical polling performs no setData or current write`, () => {
  const c=component(), input=rows(Array.from({length:count},(_,i)=>i+1));c.refresh(input);
  c.updates.length=0;
  for(let i=0;i<100;i++) c.refresh(structuredClone(input));
  assert.equal(c.updates.length,0);
  assert.equal(c.data.historyIndex,count-1);
});
test('native change never drives current back during gesture, refresh is deferred until finish', () => {
  const c=component();c.refresh(rows([1,2,3]));c.updates.length=0;
  c.historyTouchStart();c.historyTransition({detail:{dx:20}});
  c.refresh(rows([1,2,3,4]));assert.equal(c.data.liveEntries.length,3);assert.equal(c.updates.length,0);
  c.historyChange({detail:{current:1}});
  assert.ok(c.updates.every(p=>!Object.hasOwn(p,'swiperCurrent')));
  c.historyTouchEnd();c.historyAnimationFinish({detail:{current:1}});
  assert.equal(c.data.liveEntries.length,4);assert.equal(c.data.currentProposalId,2);assert.equal(c.data.swiperCurrent,1);
  assert.equal(c.timers.size,0);
});
test('new proposal follows latest only after gesture completes on latest', () => {
  const c=component();c.refresh(rows([1,2]));c.historyTouchStart();c.refresh(rows([1,2,3]));
  assert.equal(c.data.currentProposalId,2);
  c.historyTouchEnd();c.historyAnimationFinish({detail:{current:1}});
  assert.equal(c.data.currentProposalId,3);assert.equal(c.data.swiperCurrent,2);
});
test('latest refresh supersedes earlier queued payload; result updates preserve current', () => {
  const c=component();c.refresh(rows([1,2,3]));c.historyChange({detail:{current:0}});
  c.historyTouchStart();const input=rows([1,2,3]);input[2].mission={missionNo:1,status:'FAILED',successCount:1,failCount:1};
  c.refresh(input);c.refresh(rows([1,2,3,4]));c.historyTouchEnd();c.historyAnimationFinish({detail:{current:0}});
  assert.equal(c.data.currentProposalId,1);assert.equal(c.data.liveEntries.length,4);
  c.updates.length=0;c.refresh(input);
  assert.ok(c.updates.every(p=>!Object.hasOwn(p,'swiperCurrent')));
});
test('rapid repeated gestures preserve proposal ID through shifted indexes', () => {
  const c=component();c.refresh(rows([2,3,4,5]));
  for(const index of [2,1,0,1,2,3,2,1,0]) {
    c.historyTouchStart();c.historyTransition({detail:{dx:-40}});c.refresh(rows([2,3,4,5]));
    c.historyChange({detail:{current:index}});c.historyTouchEnd();c.historyAnimationFinish({detail:{current:index}});
    assert.equal(c.data.currentProposalId,index+2);assert.equal(c.data.swiperCurrent,index);
  }
  c.refresh(rows([1,2,3,4,5]));assert.equal(c.data.currentProposalId,2);assert.equal(c.data.swiperCurrent,1);
});
test('arrow bounds, single record overlay, long press fallback, detach cleanup and new game reset', () => {
  const c=component();c.refresh(rows([1]));c.shiftHistory({currentTarget:{dataset:{step:-1}}});assert.equal(c.data.swiperCurrent,0);
  c.openAllHistory();assert.equal(c.data.allHistoryOpen,true);c.closeAllHistory();
  c.historyTouchStart();c.refresh(rows([1,2]));c.historyTouchEnd();c.flushTimers();assert.equal(c.data.currentProposalId,2);
  c.shiftHistory({currentTarget:{dataset:{step:-1}}});c.historyAnimationFinish({detail:{current:0}});
  assert.equal(c.data.currentProposalId,1);c.shiftHistory({currentTarget:{dataset:{step:-1}}});assert.equal(c.data.currentProposalId,1);
  c.historyTouchStart();c.refresh(rows([1,2,3]));c.refresh(rows([6]),2);assert.equal(c.data.currentProposalId,6);assert.equal(c._pendingHistory,null);
  c.historyTouchEnd();c.detach();assert.equal(c.timers.size,0);
});
test('formal result cards use actual card count; guest fixed-slot rendering remains separate', () => {
  const c=component();
  for(let n=2;n<=5;n++) {
    c.refresh([{...rows([1])[0],mission:{missionNo:1,status:'SUCCESS',successCount:n-1,failCount:1}}]);
    assert.equal(c.data.liveEntries[0].missionCards.length,n);
  }
  const night=read('components/game-log/game-log.wxml').split('<template name="night-proposal-record">')[1].split('</template>')[0];
  assert.match(night,/wx:for="\{\{item.missionCards\}\}"/);assert.doesNotMatch(night,/missionSlots|missionSlotIndexes/);
  assert.match(night,/wx:if="\{\{compact\}\}"[^>]*compact-mission-summary/);
  assert.match(night,/wx:else class="night-mission"/);
  const [compact, detail] = night.split('wx:else class="night-mission"');
  for (const mode of [compact, detail]) assert.match(mode,/wx:for="\{\{item.missionCards\}\}"[^>]*mode="aspectFit"/);
});

test('preview and full records share sorted anonymous cards, including five-card results and live settlement', () => {
  const c=component(), pending={...rows([1])[0],resolved:true};c.refresh([pending]);
  assert.equal(c.data.liveEntries[0].resultText,'等待任务结果');
  assert.equal(c.data.liveEntries[0].missionCards.length,0);
  c.openAllHistory();
  for (const [successCount,failCount,status] of [[2,0,'SUCCESS'],[2,1,'FAILED'],[3,2,'FAILED'],[4,1,'SUCCESS']]) {
    c.refresh([{...pending,mission:{missionNo:4,successCount,failCount,status},actions:[{playerId:101,choice:'FAIL'}]}]);
    const live=c.data.liveEntries[0],full=c.data.allEntries[0];
    assert.deepEqual(live.missionCards,full.missionCards);
    assert.equal(live.missionCards.length,successCount+failCount);
    assert.ok(live.missionCards.slice(0,successCount).every(card=>card.src.endsWith('/mission-success.png')));
    assert.ok(live.missionCards.slice(successCount).every(card=>card.src.endsWith('/mission-fail.png')));
    assert.equal(live.resultTone,status==='SUCCESS'?'success':'failed');
    assert.equal(c.data.currentProposalId,1);assert.equal(c.data.allHistoryOpen,true);
  }
  c.refresh([{...pending,resolved:false,mission:{missionNo:4,successCount:3,failCount:2,status:'FAILED'}}]);
  assert.equal(c.data.liveEntries[0].missionCards.length,0);
  assert.ok(c.data.liveEntries[0].voteCells.every(cell=>cell.tone==='pending'));
});
