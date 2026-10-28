// Replay native rendered WXML with the shipped WXSS at multiple viewport widths.
// NODE_PATH=<external-install>/node_modules node scripts/qa-compact-room-layout.js [native-output-dir]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.AVALON_QA_ROOT || path.resolve(__dirname,'../miniprogram');
const output=path.resolve(process.argv[2] || '/tmp/avalon-room-fourth');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function readCss(file,host) {
  return fs.readFileSync(path.join(root,file),'utf8').replace(/@import "([^"]+)";/g,(_,name)=>readCss(path.relative(root,path.resolve(root,path.dirname(file),name)),host)).replace(/:host/g,host || '.component-host');
}
function connect(url){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url),pending=new Map();let id=0;
    ws.on('error',reject);ws.on('message',raw=>{const m=JSON.parse(raw),task=pending.get(m.id);if(!task)return;pending.delete(m.id);m.error?task.reject(Error(JSON.stringify(m.error))):task.resolve(m.result);});
    ws.on('open',()=>resolve({ws,send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));})}));
  });
}
function html(wxml){
  return wxml.replace(/<(\/?)view\b/g,'<$1div').replace(/<(\/?)text\b/g,'<$1span').replace(/(?:seat|mark)--/g,'');
}
(async()=>{
  const rendered=JSON.parse(fs.readFileSync(path.join(output,'rendered.json'),'utf8'));
  const nativeWidth=JSON.parse(fs.readFileSync(path.join(output,'native-report.json'),'utf8')).system.windowWidth;
  const menu=JSON.parse(fs.readFileSync(path.join(output,'menu.json'),'utf8'));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-compact-layout-'));
  const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-gpu','--no-first-run','about:blank'],{stdio:'ignore'});
  let cdp;try{
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<100;i++)await wait(100);
    assert.ok(fs.existsSync(portFile));const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    await cdp.send('Page.enable');const reports=[];
    for(const [width,height] of [[375,667],[390,844],[430,932]]){
      for(const f of rendered){
        const css=['app.wxss','pages/room/room.wxss','components/game-log/game-log.wxss','components/page-head/page-head.wxss','components/mission-track/mission-track.wxss','components/player-seat/player-seat.wxss'].map(file=>readCss(file)).join('\n');
        const converted=css.replace(/(-?[\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px').replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(?<![\w.-])view(?=[,\s:{>])/g,'div').replace(/(?<![\w.-])text(?=[,\s:{>])/g,'span').replace(/env\(safe-area-inset-bottom\)/g,'34px').replace(/env\(safe-area-inset-top\)/g,'44px');
        const head=rendered.find(r=>r.n===f.n&&r.header);
        let seatIndex=0;
        const board=head.board.replace(/(-?[\d.]+)px/g,(_,n)=>Number(n)*width/nativeWidth+'px').replace(/<player-seat\b[^>]*>[\s\S]*?<\/player-seat>/g,()=>head.seats[seatIndex++]);
        const markup=`<div class="page room-page night-room has-phase-actions"><page-head>${html(head.header)}</page-head><div class="game-status-row"><mission-track>${html(head.track)}</mission-track>${html(head.actions)}</div><div class="formal-game-content"><div class="formal-content-inner">${html(board)}<game-log><div class="history-swiper night-history-swiper"><div class="proposal-slide">${html(f.card)}</div></div></game-log></div></div><div class="phase-actions actions"><div class="two-buttons"><button class="btn success">同意</button><button class="btn danger">反对</button></div></div>${html(menu.wxml)}</div>`;
        const body=markup.replace(/<image\b([^>]*)>(?:<\/image>)?/g,'<img $1>').replace(/src="([^"]+)"/g,(_,src)=>{
          const filename=src.includes('/actions/mission-')?path.resolve(root,'../static-assets/avalon/cards/v2/actions',path.basename(src)):src.startsWith('/assets/')?path.join(root,src):null;
          return 'src="'+(filename?pathToFileURL(filename).href:src)+'"';
        });
        const file=path.join(profile,'fixture.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+converted+'\nbody{margin:0}button{font-family:inherit;border:0}mission-track,game-log,page-head{display:block}.formal-game-content{overflow-y:auto}.room-more-overlay{display:none}.compact-mission-card{object-fit:contain}</style>'+body);
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});const url=pathToFileURL(file).href+'?'+reports.length;
        await cdp.send('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url)))break;await wait(10);}
        // Automator omits native Text contents, so restore exact public labels.
        await evaluate(`(()=>{document.querySelector('.proposal-pager span').textContent='${f.index+1} / 6';document.querySelector('.track span').textContent='任务';document.querySelectorAll('.vote-cell').forEach((e,i)=>{e.lastElementChild.textContent=i+1;});document.querySelector('.vote-crown').textContent='♛';document.querySelector('.formal-game-content').scrollTop=10000;})()`);
        const boxes=await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,color:s.color,background:s.backgroundColor,fontWeight:s.fontWeight,border:s.borderWidth};};return {overflow:document.documentElement.scrollWidth,card:box(document.querySelector('.compact-entry')),swiper:box(document.querySelector('.night-history-swiper')),cells:[...document.querySelectorAll('.vote-cell')].map(box),summary:box(document.querySelector('.compact-mission-summary')),resultText:box(document.querySelector('.compact-result-text')),images:[...document.querySelectorAll('.compact-mission-card')].map(box),body:box(document.querySelector('.formal-game-content')),board:box(document.querySelector('.board')),title:box(document.querySelector('.log-title')),pager:box(document.querySelector('.proposal-pager')),track:box(document.querySelector('mission-track')),quick:box(document.querySelector('.room-quick-actions')),buttons:[...document.querySelectorAll('.quick-action')].map(box),footer:box(document.querySelector('.phase-actions'))};})()`);
        const label=`${width}px ${f.n} players case ${f.index}`;
        assert.ok(boxes.overflow<=width,label+' horizontal overflow');assert.ok(Math.abs(boxes.card.height-300*width/750)<.1);assert.ok(Math.abs(boxes.swiper.height-316*width/750)<.1);
        assert.ok(boxes.summary.bottom<=boxes.card.bottom,label+' clipped summary');assert.ok(boxes.summary.scrollWidth<=boxes.summary.clientWidth,label+' summary overflow');assert.ok(boxes.resultText.scrollWidth<=boxes.resultText.clientWidth,label+' clipped result text');
        assert.equal(boxes.images.length,f.sources.length);
        for(const [i,img] of boxes.images.entries()){assert.ok(Math.abs(img.width-(width<=375?50:54)*width/750)<.1);assert.ok(Math.abs(img.height/img.width-524/377)<.01);assert.ok(img.bottom<=boxes.card.bottom);assert.ok(i?boxes.images[i-1].right<img.x:boxes.resultText.right<img.x,label+' card overlap');}
        assert.ok(Math.abs(boxes.board.height-head.layout.height*width/750)<1.1,label+' table compressed');
        assert.ok(boxes.body.bottom<=boxes.footer.y+.1,label+' body overlaps footer');
        assert.ok(boxes.card.y>=boxes.body.y-.1,label+' cannot scroll to full card');
        assert.ok(boxes.title.right<=boxes.pager.x,label+' heading overlap');assert.ok(boxes.track.right<boxes.quick.x,label+' track overlap');
        for(const c of boxes.cells)assert.ok(c.x>=boxes.card.x&&c.right<=boxes.card.right&&c.width>=24,label+' clipped vote cell');
        for(const b of boxes.buttons){assert.equal(b.background,'rgba(10, 20, 17, 0.82)');assert.equal(b.fontWeight,'600');assert.equal(b.color,'rgb(255, 255, 255)');assert.ok(Math.abs(b.height-56*width/750)<.1);assert.ok(b.right<=width);}
        assert.ok(boxes.footer.bottom<=height+1&&boxes.footer.y>=boxes.card.bottom,label+' footer visibility');
        reports.push({width,height,n:f.n,index:f.index,boxes});
        if(f.n===10&&f.index===5){const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,width+'-full-room-layout.png'),Buffer.from(screenshot.data,'base64'));}
      }
      console.log('RESPONSIVE_COMPACT_PASS',width,height,rendered.length,'native-rendered cases');
    }
    fs.writeFileSync(path.join(output,'responsive-report.json'),JSON.stringify(reports,null,2));console.log('RESPONSIVE_CASES',reports.length);
  }finally{if(cdp)cdp.ws.close();chrome.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
