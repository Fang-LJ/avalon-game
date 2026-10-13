// Additional layout checks using the shipped WXSS in headless Chromium.
// NODE_PATH=<external-install>/node_modules node scripts/qa-guest-ui-layout.js [output-dir]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const WebSocket = require('ws'), assert = require('node:assert/strict');
const { navigationMetrics } = require('../miniprogram/utils/guest-navigation');
const root = path.resolve(__dirname, '../miniprogram');
const output = path.resolve(process.argv[2] || '/tmp/avalon-guest-ui-layout');
fs.mkdirSync(output, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function readCss(file) {
  return fs.readFileSync(file, 'utf8').replace(/@import "([^"]+)";/g, (_, name) => readCss(path.resolve(path.dirname(file), name)));
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
    ws.on('error', reject);
    ws.on('message', raw => {
      const message = JSON.parse(raw), task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result);
    });
    ws.on('open', () => resolve({ ws, send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    }) }));
  });
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'avalon-guest-layout-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await wait(100);
    assert.ok(fs.existsSync(portFile), 'Chrome starts');
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    cdp = await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    await cdp.send('Page.enable');
    const cssSources = ['app.wxss', 'pages/demo-room/demo-room.wxss', 'components/guest-header/guest-header.wxss', 'components/mission-track/mission-track.wxss'];
    const sourceCss = cssSources.map(file => readCss(path.join(root, file))).join('\n');
    const sourceHeader = fs.readFileSync(path.join(root, 'components/guest-header/guest-header.wxml'), 'utf8');
    const reports = [];
    for (const [width, height, status, inset] of [[320,568,20,0], [375,667,20,0], [375,812,44,34], [390,844,47,34], [430,932,59,34]]) {
      const metrics = navigationMetrics({ windowWidth: width, statusBarHeight: status }, { top: status + 4, bottom: status + 36, height: 32, left: width - 100 });
      const css = sourceCss.replace(/(-?[\d.]+)rpx/g, (_, n) => Number(n) * width / 750 + 'px')
        .replace(/\bpage\s*\{/g, 'body {').replace(/\bview(?=[,\s{])/g, 'div').replace(/\btext(?=[,\s{])/g, 'span')
        .replace(/env\(safe-area-inset-bottom\)/g, inset + 'px').replace(/:host/g, '.component-host');
      const header = sourceHeader.replace(/{{(navTop|navHeight|navWidth|contentTop)}}/g, (_, key) => metrics[key])
        .replace(/{{title}}/g, '第 1 轮 · 队长选人').replace(/<view wx:if="{{subtitle}}"[^>]*>.*?<\/view>/g, '')
        .replace(/<(\/?)view\b/g, '<$1div').replace(/wx:if="{{title}}"/g, '');
      const html = `<div class="page guest-page demo-page has-demo-actions">${header}
        <div class="demo-status-row"><mission-track class="component-host"><div class="track"><span class="muted">任务</span>${[2,3,2,3,3].map(n=>`<div class="dot PENDING">${n}</div>`).join('')}</div></mission-track>
        <div class="demo-quick-actions"><button class="quick-action">刺杀</button><button class="quick-action">我的身份</button></div></div>
        <div class="demo-status"><span>选择 2 名玩家执行任务。</span><button class="history-trigger">记录</button></div>
        <div class="board"></div><div style="height:800px"></div>
        <div class="phase-actions"><button class="btn">确认发车</button></div></div>`;
      const file = path.join(profile, `${width}-${height}.html`);
      fs.writeFileSync(file, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '\nbody{margin:0;}button{font-family:inherit;}mission-track{display:block;}</style>' + html);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      const url = pathToFileURL(file).href; await cdp.send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { if (await evaluate('document.readyState==="complete" && location.href===' + JSON.stringify(url))) break; await wait(50); }
      const boxes = await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {back:box(document.querySelector('.back')),title:box(document.querySelector('.title')),track:box(document.querySelector('mission-track')),quick:[...document.querySelectorAll('.quick-action')].map(box),action:box(document.querySelector('.phase-actions .btn')),overflow:document.documentElement.scrollWidth};})()`);
      assert.ok(boxes.overflow <= width + 1, 'no horizontal overflow');
      assert.ok(boxes.back.y >= status && boxes.back.right < width - 100, 'back clears notch and capsule');
      assert.ok(boxes.title.y >= metrics.contentTop, 'title clears capsule');
      assert.ok(boxes.quick.every(b => b.x >= boxes.track.right && b.right <= width && b.y < boxes.track.bottom), 'track and quick actions share a row without overlap');
      assert.ok(boxes.action.bottom <= height - inset, 'phase action clears home indicator');
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `${width}-${height}.png`), Buffer.from(screenshot.data, 'base64'));
      await evaluate('scrollTo(0,500)'); await wait(50);
      const top = await evaluate("document.querySelector('.back').getBoundingClientRect().top");
      assert.equal(top, boxes.back.y, 'fixed return while scrolling');
      reports.push({ width, height, metrics, boxes }); console.log('GUEST_LAYOUT_PASS', width, height);
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
  } finally { if (cdp) cdp.ws.close(); chrome.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
