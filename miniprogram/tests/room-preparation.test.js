const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const w=read('pages/room/room.wxml'),css=read('pages/room/room.wxss'),ui=require('../utils/presentation');
const invite=w.match(/<button class="lobby-invite"[\s\S]*?<\/button>/)[0],start=w.match(/<button wx:if="\{\{room.host\}\}" class="btn lobby-start[^"]*"[\s\S]*?<\/button>/)[0];
const attr=(markup,name,context)=>vm.runInNewContext(markup.match(new RegExp(name+'="\\{\\{([\\s\\S]*?)\\}\\}"'))[1],context);
for(const host of [true,false])for(const full of [true,false])test(`footer host=${host} full=${full} uses live authority and membership`,()=>{
 const context={room:{host,currentPlayers:full?7:6,maxPlayers:7,canStart:host&&full,status:'WAITING'},busy:false,botAdding:false};
 assert.equal(attr(start,'wx:if',context),host);assert.equal(attr(invite,'disabled',context),full);
 assert.equal(attr(invite,'open-type',context),full?'':'share');assert.equal(attr(start,'disabled',context),!context.room.canStart);
 context.room.canStart=false;assert.equal(attr(start,'disabled',context),true);
 context.busy=true;assert.equal(attr(invite,'open-type',context),'');assert.equal(attr(invite,'disabled',context),true);
 context.busy=false;context.room.host=!host;assert.equal(attr(start,'wx:if',context),!host);
 context.room.status='CLOSED';assert.equal(attr(invite,'open-type',context),'');
});
test('preparation scrolling is contained, non-bouncing and independent of refresh/reconnect',()=>{
 assert.equal(JSON.parse(read('pages/room/room.json')).enablePullDownRefresh,false);
 assert.equal((w.match(/class="preparation-scroll"/g)||[]).length,2);
 assert.equal((w.match(/bounces="\{\{false\}\}"/g)||[]).length,2);
 assert.match(css,/\.room-page.preparation-page \{[^}]*position: fixed;[^}]*min-height: 0;/);
 assert.match(css,/\.preparation-scroll \{ flex: 1; height: 0; min-height: 0/);
 assert.match(css,/\.lobby-footer.host-footer.room-full \{ grid-template-columns: minmax\(0, 35fr\) minmax\(0, 65fr\)/);
 assert.match(read('pages/room/room.js'),/setInterval\(\(\) => this.refresh\(\), 5000\)/);
 assert.match(read('utils/socket.js'),/retryTimer = setTimeout\(open, 2000\)/);
 assert.match(read('components/play-card/play-card.wxss'), /\.size-large \{ width: 400rpx; height: 715rpx; \}/);
 assert.match(w, /<view class="identity-body">[\s\S]*card-deal-stage[\s\S]*role-progress[\s\S]*<\/view>\s*<\/scroll-view>/);
});
for(const n of [5,6,7,8,9,10])test(`${n} lobby avatar centers form a circle on one rpx scale`,()=>{
 const original=ui.lobbySeats([],n),adaptive=ui.lobbySeats([],n,true),g=ui.lobbyGeometry(n),half=n>=9?50:56;
 const centers=adaptive.map((seat,i)=>{
  assert.equal(seat.seatNo,i+1);assert.equal(seat.playerId,original[i].playerId);
  assert.equal(original[i].position,ui.seatPosition(i+1,n)); // Legacy and formal coordinates are unchanged.
  const [,x,y]=seat.position.match(/left:calc\(50% \+ ([-\d.]+)rpx\);top:([-\d.]+)rpx/);
  const center={x:Number(x),y:Number(y)+half-g.centerTop};
  assert.ok(Math.abs(Math.hypot(center.x,center.y)-g.radius)<.002);
  assert.ok(Number(y)+half*2+90<=g.height+.001);
  return center;
 });
 assert.equal(centers[0].x,0);assert.equal(centers[0].y,-g.radius);
 assert.ok(centers[1].x>0);assert.ok(centers[n-1].x<0);
 assert.match(css,/\.preparation-page \.lobby-board, \.preparation-page \.lobby-board.large-table \{ flex: 0 0 auto; min-height: 0;/);
 assert.doesNotMatch(css,/\.preparation-page \.lobby-size-\d+ \{ min-height:/);
});
test('room action row exposes one disabled bot control to members and equal width controls',()=>{
 const actions=w.match(/<view class="lobby-room-actions">([\s\S]*?)<\/view>/)[1];
 const buttons=[...actions.matchAll(/<button[^>]+>[\s\S]*?<\/button>/g)].map(m=>m[0]);
 assert.equal(buttons.length,4);
 assert.deepEqual(buttons.map(b=>b.match(/>([^<>]*)<\/button>$/)[1]),['＋机器人','复制','退出','关闭']);
 assert.equal((buttons[0].match(/wx:if/g)||[]).length,0);
 for(const host of [false,true])for(const full of [false,true])for(const botAdding of [false,true]){
  const c={room:{host,currentPlayers:full?6:5,maxPlayers:6,status:'WAITING'},busy:false,botAdding};
  assert.equal(attr(buttons[0],'disabled',c),!host||full||botAdding);
  assert.equal(attr(buttons[3],'wx:if',c),host);
 }
 assert.match(css,/\.lobby-info \.lobby-room-button \{ flex: 1; min-width: 0;/);
});
test('bot requests lock starting without changing invite availability or loading',()=>{
 const c={room:{host:true,currentPlayers:6,maxPlayers:7,canStart:false,status:'WAITING'},busy:false,botAdding:true};
 assert.equal(attr(invite,'disabled',c),false);assert.equal(attr(invite,'open-type',c),'share');
 assert.equal(attr(start,'loading',c),false);assert.equal(attr(start,'disabled',c),true);
 c.room.currentPlayers=7;c.room.canStart=true;
 assert.equal(attr(start,'disabled',c),true);assert.equal(attr(start,'loading',c),false);
 assert.match(css,/\.lobby-footer \.lobby-start.bot-add-locked\[disabled\]/);
 c.botAdding=false;assert.equal(attr(start,'disabled',c),false);
});
