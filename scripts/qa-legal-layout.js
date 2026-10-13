// Consent area layout checks using the exported native login DOM and actual WXSS.
// Run qa-legal-login.js first to export login-dom.json, then use an external ws install via NODE_PATH.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const WebSocket = require('ws'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../miniprogram');
const output = path.resolve(process.argv[2] || '/tmp/avalon-legal-native');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function connect(url) { return new Promise((resolve, reject) => {
  const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
  ws.on('error', reject); ws.on('message', raw => { const m = JSON.parse(raw); if (pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } });
  ws.on('open', () => resolve({ ws, send: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  }) }));
}); }
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'avalon-polish-chrome-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await wait(100);
    assert.ok(fs.existsSync(portFile));
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    cdp = await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    const evaluate = async expression => { const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await cdp.send('Page.enable');

    const record = JSON.parse(fs.readFileSync(output+'/login-dom.json','utf8'));
    const sourceCss = ['app.wxss','pages/login/login.wxss'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
    const results=[];
    for(const [width,height] of [[320,480],[320,568],[375,667],[375,812],[390,844],[430,932]]){
      const bottomInset = height >= 812 ? 34 : 0;
      const css=sourceCss.replace(/(-?[\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px').replace(/(^|\n)page\s*\{/g,'$1body {').replace(/\bview(?=[,\s{])/g,'div').replace(/\bimage(?=[,\s{])/g,'img').replace(/env\(safe-area-inset-bottom\)/g,bottomInset+'px');
      const html=record.wxml.replace(/<(\/?)view\b/g,'<$1div').replace(/<(\/?)text\b/g,'<$1span').replace(/<image\b/g,'<img').replace(/<\/image>/g,'').replace(/src="(\/assets\/[^\"]+)"/g,(_,src)=>'src="'+pathToFileURL(root+src).href+'"');
      const file=path.join(profile,'login-'+width+'-'+height+'.html');
      fs.writeFileSync(file,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{margin:0;}button{font-family:inherit;}img{object-fit:contain;}</style>'+html);
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      const url=pathToFileURL(file).href;await cdp.send('Page.navigate',{url});
      for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && location.href==='+JSON.stringify(url)))break;await wait(50);}
      await evaluate(`(()=>{const t=${JSON.stringify(record.texts)};document.querySelectorAll('span').forEach((e,i)=>{e.textContent=t[i];});return true;})()`);
      const boxes=await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return {cards:[...document.querySelectorAll('.guest-feature')].map(box),login:box(document.querySelector('.login-actions .btn')),agreement:box(document.querySelector('.agreement-area')),checkbox:box(document.querySelector('.agreement-checkbox')),circle:box(document.querySelector('.agreement-circle')),circleRadius:getComputedStyle(document.querySelector('.agreement-circle')).borderRadius,links:[...document.querySelectorAll('.legal-link')].map(box),brand:box(document.querySelector('.brand-mark')),docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,viewport:innerWidth};})()`);
      assert.ok(boxes.docWidth<=width+1,'no horizontal overflow');assert.equal(boxes.cards[0].y,boxes.cards[1].y);assert.equal(boxes.cards[2].y,boxes.cards[3].y);
      assert.ok(boxes.cards.every(b=>Math.abs(b.width-boxes.cards[0].width)<=1&&Math.abs(b.height-boxes.cards[0].height)<=1));assert.ok(boxes.login.y-boxes.cards[3].bottom>=39,'login has at least 40px breathing room from grid');assert.ok(boxes.brand.y>=100,'clears capsule');
      assert.ok(boxes.circle.width>=20&&boxes.circle.width<=24&&Math.abs(boxes.circle.width-boxes.circle.height)<1,'22px round control');assert.equal(boxes.circleRadius,'50%');assert.ok(boxes.checkbox.width>=44&&boxes.checkbox.height>=44,'44px touch target');
      if(boxes.docHeight<=height+1)assert.ok(Math.abs(height-boxes.agreement.bottom-(16+bottomInset))<=1,'footer anchored near bottom safe area on tall screens: '+JSON.stringify({height,bottomInset,agreement:boxes.agreement.bottom,docHeight:boxes.docHeight}));
      if(height===480)assert.ok(boxes.docHeight>height,'short screen scrolls naturally');
      assert.ok(boxes.agreement.y>boxes.login.bottom,'consent below login button');assert.ok(boxes.agreement.bottom<=boxes.docHeight+1,`consent can be reached by scrolling: bottom=${boxes.agreement.bottom}, doc=${boxes.docHeight}`);assert.ok(boxes.links.every(b=>b.x>=0&&b.x+b.width<=width),'links remain in screen');
      await evaluate('scrollTo(0,document.documentElement.scrollHeight)');await wait(50);
      const reachable=await evaluate(`(()=>{const r=document.querySelector('.agreement-area').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,scroll:scrollY,docHeight:document.documentElement.scrollHeight};})()`);assert.ok(reachable.top>=-1&&reachable.bottom<=reachable.height+1,'consent fully visible when scrolled to bottom: '+JSON.stringify(reachable));
      const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(output+'/login-layout-'+width+'-'+height+'.png',Buffer.from(screenshot.data,'base64'));
      results.push({width,height,bottomInset,boxes});console.log('LAYOUT_PASS',width,height);
    }
    fs.writeFileSync(output+'/layout-report.json',JSON.stringify(results,null,2));
  } finally { if(cdp)cdp.ws.close();chrome.kill('SIGTERM'); }
})().catch(e=>{console.error(e);process.exitCode=1;});
