// Replay native rendered WXML with the shipped WXSS at multiple viewport widths.
// NODE_PATH=<external-install>/node_modules node scripts/qa-identity-table-layout.js [native-output-dir]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const WebSocket=require('ws'),assert=require('node:assert/strict');
const root=process.env.AVALON_QA_ROOT || path.resolve(__dirname,'../miniprogram');
const output=path.resolve(process.argv[2] || '/tmp/avalon-identity-table');
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
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-identity-layout-'));
  const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-gpu','--no-first-run','about:blank'],{stdio:'ignore'});
  let cdp;try{
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<100;i++)await wait(100);
    assert.ok(fs.existsSync(portFile));const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    await cdp.send('Page.enable');const reports=[];
    for(const [width,height] of [[320,568],[375,667],[375,812],[390,844],[430,932]]){
      for(const f of rendered){
        const css=['app.wxss','pages/room/room.wxss'].map(file=>readCss(file)).join('\n')+'\n'+readCss('components/player-seat/player-seat.wxss','.seat-host')+'\n'+readCss('components/knowledge-mark/knowledge-mark.wxss','knowledge-mark');
        // Match only the page selector; preserve .room-page and .demo-page classes.
        const converted=css.replace(/(-?[\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px').replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(?<![\w.-])view(?=[,\s:{>])/g,'div').replace(/(?<![\w.-])text(?=[,\s:{>])/g,'span').replace(/env\(safe-area-inset-bottom\)/g,'34px');
        const body=`<div class="page room-page" style="padding-top:80px"><div class="board ${f.n>=9?'large-table':''}">${f.seats.map(s=>`<div class="positioned-seat" style="${s.player.position}"><div class="seat-host">${html(s.wxml)}</div></div>`).join('')}${html(f.center)}</div></div>`;
        const file=path.join(profile,'fixture.html');fs.writeFileSync(file,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+converted+'\nbody{margin:0}knowledge-mark{display:block}span{box-sizing:border-box}</style>'+body);
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});const url=pathToFileURL(file).href+'?'+reports.length;
        await cdp.send('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url)))break;await wait(20);}
        // Automator serializes Text nodes without content. Restore visible symbols only.
        await evaluate(`(()=>{for(const e of document.querySelectorAll('.leader-icon'))e.textContent='♛';for(const e of document.querySelectorAll('.action-done-icon'))e.textContent='✓';for(const e of document.querySelectorAll('.me-icon'))e.textContent='我';for(const e of document.querySelectorAll('.guess-question'))e.textContent='?';for(const e of document.querySelectorAll('.rejection-label'))e.textContent='否决';for(const e of document.querySelectorAll('.seat-avatar > span:first-child'))if(!e.className)e.textContent='玩';})()`);
        const boxes=await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,whiteSpace:s.whiteSpace,color:s.color,background:s.backgroundColor,border:s.borderWidth,padding:s.padding,textOverflow:s.textOverflow};};return {board:box(document.querySelector('.board')),center:box(document.querySelector('.board-center')),children:[...document.querySelector('.board-center').children].map(box),avatars:[...document.querySelectorAll('.seat-avatar')].map(box),badges:[...document.querySelectorAll('.role-mark')].map(box),questions:[...document.querySelectorAll('.guess-question')].map(box),crowns:[...document.querySelectorAll('.leader-icon')].map(box),overflow:document.documentElement.scrollWidth};})()`);
        const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.x,b.x)+.5 && Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+.5;
        const label=width+'x'+height+' '+f.name;
        assert.ok(boxes.overflow<=width+1,label+' horizontal overflow');
        assert.ok(Math.abs(boxes.center.x+boxes.center.width/2-boxes.board.x-boxes.board.width/2)<1,label+' centered');
        assert.equal(boxes.center.background,'rgba(0, 0, 0, 0)');assert.equal(boxes.center.border,'0px');assert.equal(boxes.center.padding,'0px');
        assert.ok(boxes.avatars.every(a=>!overlap(a,boxes.center)),label+' center overlaps avatar');
        assert.ok(boxes.crowns.every(a=>!overlap(a,boxes.center)),label+' center overlaps crown');
        for(const b of boxes.badges){assert.equal(b.color,'rgb(255, 255, 255)');assert.ok(b.x>=0 && b.right<=width,label+' clipped badge');}
        for(const b of boxes.questions){assert.equal(b.color,'rgb(229, 201, 122)');assert.ok(b.x>=0 && b.right<=width,label+' clipped private question');}
        assert.ok(boxes.children.every(b=>b.bottom<=boxes.center.bottom+1 && b.x>=boxes.center.x-1 && b.right<=boxes.center.right+1 && b.scrollHeight<=b.clientHeight+1),label+' center content clipped');
        if([7,10].includes(f.n) && (f.name.endsWith('-forced') || f.name.endsWith('-long') || f.name==='10-PERCIVAL-system') && [320,390,430].includes(width)){
          const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${width}-${height}-${f.name}.png`),Buffer.from(screenshot.data,'base64'));
        }
        reports.push({width,height,name:f.name,boxes});
      }
      console.log('RESPONSIVE_TABLE_PASS',width,height,rendered.length,'native-rendered states');
    }
    fs.writeFileSync(path.join(output,'responsive-report.json'),JSON.stringify(reports,null,2));console.log('RESPONSIVE_CASES',reports.length);
  }finally{if(cdp)cdp.ws.close();chrome.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
