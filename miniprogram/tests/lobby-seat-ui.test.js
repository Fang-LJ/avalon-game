const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const markup=read('pages/room/room.wxml'),css=read('components/player-seat/player-seat.wxss');
test('all room sizes retain one untruncated seat number and a CSS-truncated nickname',()=>{
  const seat=read('components/player-seat/player-seat.wxml');
  assert.match(seat,/class="seat-caption"[\s\S]*class="seat-number">\{\{player.seatNo\}\}[\s\S]*class="seat-divider">·[\s\S]*class="seat-name"/);
  assert.doesNotMatch(seat,/号位|seat-bot|hideNickname/);
  assert.match(css,/\.seat-number \{ flex-shrink: 0/);
  assert.match(css,/\.seat-name \{ min-width: 0; overflow: hidden; text-overflow: clip; white-space: nowrap/);
  for(const size of [25,24,21])assert.ok(css.includes('font-size: '+size+'rpx'));
  assert.doesNotMatch(markup,/hideNickname=/);
  assert.match(markup,/dense="\{\{room.maxPlayers === 8\}\}"/);
});
test('lobby actions move without changing sharing, bot or seat event bindings',()=>{
  assert.doesNotMatch(markup,/座位 ·/);
  assert.match(markup,/class="lobby-room-button bot-add" disabled="\{\{!room.host \|\| busy \|\| botAdding/);
  assert.match(markup,/loading="\{\{botAdding\}\}" bindtap="addBot"/);
  for(const binding of ['class="lobby-invite"','bindtap="copyCode"','bind:select="handleLobbySeat"','bindtap="leaveRoom"'])assert.ok(markup.includes(binding));
  assert.doesNotMatch(markup,/card lobby-card|card lobby-center|card lobby-rules|我的座位|点击机器人头像可移除|可添加机器人补充空位|仅房主可开始/);
  assert.match(read('pages/room/room.js'),/lobbyStatusLines: lobbyStatus.split\(' · '\)/);
});
test('nomination keeps authority checks and retry UI while removing only the duplicated size prompt',()=>{
  const block=markup.split('<view class="phase-actions actions">')[1].split("game.phase === 'TEAM_VOTING'")[0];
  assert.match(block,/class="btn nomination-button"/);
  assert.equal((block.match(/selectedIds.length !== game.requiredTeamSize \|\| busy \|\| teamSyncError/g)||[]).length,2);
  assert.match(block,/bindtap="retryTeamDraft"/);assert.doesNotMatch(block,/正在同步人选…/);
  assert.doesNotMatch(block,/请选择|名任务成员/);
  assert.match(read('pages/room/room.wxss'),/button.nomination-button \{ background: #D8B25C; color: #101713; font-weight: 700/);
});
