const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const {historyCard}=require('../utils/history-presentation');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(api={}) {
 let page,code='',session=true;const routes=[];
 const invite={validRoomCode:v=>typeof v==='string'&&/^\d{6}$/.test(v)?v:'',save:v=>{code=v;},clear:v=>{if(code===v)code='';}};
 const auth={requireSession:()=>session};
 vm.runInNewContext(fs.readFileSync(path.join(root,'pages/join/join.js'),'utf8'),{Page:p=>page=p,require:n=>({'../../services/avalon':api,'../../services/auth':auth,'../../utils/invite':invite}[n]),wx:{redirectTo:o=>{routes.push(o.url);o.success();},reLaunch:o=>routes.push(o.url)}});
 page.data=structuredClone(page.data);page.setData=v=>Object.assign(page.data,v);page.onLoad({roomCode:'000123'});page._active=true;
 return{page,routes,code:()=>code,session:v=>{session=v;}};
}
const preview=(extra={})=>({roomCode:'000123',status:'WAITING',maxPlayers:7,currentPlayers:1,seatedPlayers:1,member:false,seats:Array.from({length:7},(_,i)=>({seatNo:i+1,occupied:!i})),...extra});
test('own alignment maps every winning/losing camp without role-name assumptions',()=>{
 for(const alignment of ['GOOD','EVIL'])for(const winner of ['GOOD','EVIL']){
  const card=historyCard({alignment,winner,roleName:'任意角色',won:alignment!==winner});
  assert.equal(card.outcome,alignment===winner?'win':'loss');assert.equal(card.roleTone,alignment==='GOOD'?'good':'evil');
  assert.equal(card.outcomeText,(alignment==='GOOD'?'正义':'邪恶')+'阵营'+(alignment===winner?'胜利':'失败'));
 }
 assert.equal(historyCard({alignment:'EVIL',winner:null,finishReason:'HOST_ENDED'}).outcomeText,'房主结束 · 不计胜负');
 assert.equal(historyCard({alignment:'GOOD',winner:'GOOD',finishReason:'HOST_ENDED'}).outcome,'neutral');
});
test('preview is read-only and never joins automatically',async()=>{
 let joins=0;const f=fixture({invitePreview:async code=>{assert.equal(code,'000123');return preview();},joinRoom:()=>joins++});
 await f.page.loadPreview();assert.equal(f.page.data.canJoin,true);assert.equal(f.page.data.preview.seats.length,7);assert.equal(joins,0);assert.equal(f.code(),'000123');
});
test('full, started, expired and transient network states',async()=>{
 for(const [value,kind] of [[preview({currentPlayers:7}),'full'],[preview({status:'PLAYING'}),'started'],[preview({status:'CLOSED'}),'missing']]){
  const f=fixture({invitePreview:async()=>value});await f.page.loadPreview();assert.equal(f.page.data.state.kind,kind);assert.equal(f.page.data.canJoin,false);
 }
 const f=fixture({invitePreview:async()=>{throw Error('请求超时');}});await f.page.loadPreview();assert.equal(f.page.data.state.kind,'network');assert.equal(f.page.data.previewLoading,false);
});
test('join is single flight and uses server automatic seat, not preview occupancy',async()=>{
 const request=deferred();let joins=0;const f=fixture({invitePreview:async()=>preview(),joinRoom:()=>{joins++;return request.promise;}});
 await f.page.loadPreview();const pending=f.page.submit();f.page.submit();f.page.decline();assert.equal(f.routes.length,0);
 request.resolve({roomId:9,status:'WAITING',mySeatNo:4});await pending;assert.equal(joins,1);assert.equal(f.code(),'');assert.equal(f.routes[0],'/pages/room/room?roomId=9');
});
test('existing standing member uses the original seat API',async()=>{
 let selected;const f=fixture({invitePreview:async()=>preview({member:true}),joinRoom:async()=>({roomId:9,status:'WAITING',mySeatNo:null,maxPlayers:5,players:[{seatNo:1},{seatNo:3}]}),seat:async(id,seat)=>{selected=seat;return{roomId:id};}});
 await f.page.loadPreview();await f.page.submit();assert.equal(selected,2);
});
test('already-playing member can return without sending another join',async()=>{
 const f=fixture({invitePreview:async()=>preview({member:true,status:'PLAYING',roomId:9})});await f.page.loadPreview();assert.equal(f.page.data.returning,true);await f.page.submit();assert.equal(f.routes[0],'/pages/room/room?roomId=9');
});
test('room starts between preview and join: refresh exposes started state',async()=>{
 let reads=0;const f=fixture({invitePreview:async()=>preview({status:reads++?'PLAYING':'WAITING'}),joinRoom:async()=>{throw Object.assign(Error('房间不存在'),{code:'NOT_FOUND'});}});
 await f.page.loadPreview();await f.page.submit();assert.equal(f.page.data.state.kind,'started');assert.equal(f.routes.length,0);
});
test('late preview cannot overwrite a newer view or an unloaded page',async()=>{
 const a=deferred(),b=deferred();let reads=0;const f=fixture({invitePreview:()=>reads++?b.promise:a.promise});
 const first=f.page.loadPreview(),second=f.page.loadPreview();b.resolve(preview({currentPlayers:3}));await second;a.resolve(preview());await first;assert.equal(f.page.data.preview.currentPlayers,3);
 const q=deferred(),g=fixture({invitePreview:()=>q.promise});const pending=g.page.loadPreview();g.page.onUnload();q.resolve(preview());await pending;assert.equal(g.page.data.preview,null);
});
test('unauthenticated invitation persists and decline does not join',async()=>{
 let calls=0;const f=fixture({invitePreview:()=>calls++});f.session(false);f.page.onShow();assert.equal(calls,0);assert.equal(f.code(),'000123');f.session(true);f.page.decline();assert.equal(f.code(),'');assert.equal(f.routes[0],'/pages/index/index');
});
