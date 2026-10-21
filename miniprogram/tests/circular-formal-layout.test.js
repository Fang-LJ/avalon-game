const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../utils/presentation');
function point(style){const m=style.match(/calc\(50% \+ ([-\d.]+)rpx\);top:([-\d.]+)rpx/);return{x:Number(m[1]),y:Number(m[2])};}
for(const n of [5,6,7,8,9,10])test(`${n} players: equal physical radii, shared clockwise angles and centered avatars`,()=>{
 const g=ui.formalGeometry(n),l=ui.lobbyGeometry(n),players=Array.from({length:n},(_,i)=>({playerId:i+1,seatNo:i+1,nickname:'玩家'}));
 const seats=ui.seats(players,[1],2,n,'TEAM_VOTING',g),lobby=ui.lobbySeats(players,n,true);
 assert.equal(g.radius,l.radius);assert.equal(seats[0].selected,true);assert.equal(seats[1].leader,true);
 const points=seats.map(s=>point(s.position));
 assert.equal(points[0].x,0);assert.equal(points[0].y,24);
 for(let i=0;i<n;i++){
  const p=points[i],q=point(lobby[i].position),dy=p.y+g.avatarSize/2-g.centerTop;
  assert.ok(Math.abs(Math.hypot(p.x,dy)-g.radius)<.002);
  assert.ok(Math.abs(p.x-q.x)<.002);assert.ok(Math.abs(dy-(q.y+(n>=9?50:56)-l.centerTop))<.002);
  assert.ok(p.y>=24-.002);assert.ok(p.y+g.avatarSize+46<=g.height);
  for(const width of [320,375,390,430]){
   const scale=width/750;
   // Page padding is 38rpx, with a 64/56rpx seat half-width.
   assert.ok(Math.abs(p.x)+(n>=9?56:64)<(750-76)/2);
   assert.ok(Math.abs(Math.hypot(p.x*scale,dy*scale)-g.radius*scale)<.002);
  }
 }
});
test('formal centers include caption clearance without inheriting tall legacy container',()=>{
 assert.equal(ui.formalGeometry(5).height,730);assert.equal(ui.formalGeometry(8).height,708);assert.equal(ui.formalGeometry(10).height,734);
});
