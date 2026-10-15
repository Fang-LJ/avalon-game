const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const w=read('pages/room/room.wxml'),css=read('pages/room/room.wxss'),ui=require('../utils/presentation');
const invite=w.match(/<button class="lobby-invite"[\s\S]*?<\/button>/)[0],start=w.match(/<button wx:if="\{\{room.host\}\}" class="btn lobby-start"[\s\S]*?<\/button>/)[0];
const attr=(markup,name,context)=>vm.runInNewContext(markup.match(new RegExp(name+'="\\{\\{([\\s\\S]*?)\\}\\}"'))[1],context);
for(const host of [true,false])for(const full of [true,false])test(`footer host=${host} full=${full} uses live authority and membership`,()=>{
 const context={room:{host,currentPlayers:full?7:6,maxPlayers:7,canStart:host&&full,status:'WAITING'},busy:false};
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
for(const n of [5,6,7,8,9,10])test(`${n} adaptive lobby preserves numbering and horizontal seat positions`,()=>{
 const original=ui.lobbySeats([],n),adaptive=ui.lobbySeats([],n,true);
 for(let i=0;i<n;i++){assert.equal(adaptive[i].seatNo,i+1);assert.equal(adaptive[i].playerId,original[i].playerId);assert.equal(adaptive[i].position.split(';')[0],original[i].position.split(';')[0]);assert.match(adaptive[i].position,/top:calc\([\d.]+% - [\d.]+rpx\)/);}
});
