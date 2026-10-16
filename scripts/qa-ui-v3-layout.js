// Render actual native WXML with shipped styles at three widths; isolate all data/assets locally.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url'), WebSocket = require('ws');
const root = path.resolve(__dirname, '../miniprogram'), output = process.argv[2] || '/tmp/avalon-ui-v3';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let serial = 0;
    ws.on('error', reject);
    ws.on('message', raw => { const m = JSON.parse(raw), p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
    ws.on('open', () => resolve({ ws, send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }) }));
  });
}
(async () => {
  const native = JSON.parse(fs.readFileSync(path.join(output, 'native-report.json'), 'utf8'));
  const names = ['login', 'home', 'history', 'profile', 'me', 'avatar-sheet', 'home-current-room', 'history-empty', 'me-long-name', 'me-role-statistics', 'home-long-name'];
  const fixtures = native.reports.filter(f => names.includes(f.name));
  const metadata = JSON.parse(fs.readFileSync(path.join(root, '../docs/ui-v3-assets.json'), 'utf8')).assets;
  const dimensions = Object.fromEntries(metadata.map(a => [path.basename(a.path), a]));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'avalon-v3-layout-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--allow-file-access-from-files', '--disable-gpu', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    const portfile = path.join(profile, 'DevToolsActivePort'); for (let i = 0; i < 100 && !fs.existsSync(portfile); i++) await pause(100);
    const port = Number(fs.readFileSync(portfile, 'utf8').split('\n')[0]);
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); cdp = await connect(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    const evaluate = async expression => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const reports = [];
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) for (const f of fixtures) {
      const pageName = f.route.split('/')[1];
      const sheet = [read('app.wxss'), read('styles/ui-v3.wxss'), read('pages/' + pageName + '/' + pageName + '.wxss'), read('components/page-head/page-head.wxss').replace(/:host/g, 'page-head'), read('components/game-card/game-card.wxss').replace(/:host/g, 'game-card'), read('components/app-tab-bar/app-tab-bar.wxss').replace(/:host/g, 'app-tab-bar')].join('\n').replace(/@import[^;]+;/g, '').replace(/(^|\n)page\s*\{/g, '$1body {').replace(/(?<=[\s>+~,(])(view|text|image)(?=[\s>+~,:.#\[{])/g, (_, tag) => ({view:'div',text:'span',image:'img'}[tag]));
      let markup = f.markup.replace(/\b\w+--/g, '').replace(/<(\/?)view\b/g, '<$1div').replace(/<(\/?)text\b/g, '<$1span').replace(/<image\b/g, '<img').replace(/<\/image>/g, '').replace(/(<input\b[^>]*>)[^<]*<\/input>/g, '$1').replace(/src="(\/assets\/[^\"]+)"/g, (_, asset) => 'src="' + pathToFileURL(path.join(root, asset)).href + '"');
      const html = ('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + sheet + '\nbody{margin:0}div,span,button,input,img{box-sizing:border-box}button,input{font-family:inherit}img{display:block}*{animation:none!important;transition:none!important}</style>' + markup).replace(/(-?[\d.]+)rpx/g, (_, v) => Number(v) * width / 750 + 'px').replace(/env\(safe-area-inset-bottom\)/g, '34px');
      const file = path.join(profile, 'page.html'); fs.writeFileSync(file, html);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      const url = pathToFileURL(file).href + '?case=' + reports.length; await cdp.send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { if (await evaluate('document.readyState === "complete" && location.href === ' + JSON.stringify(url))) break; await pause(20); }
      await evaluate(`(() => {
        const f=${JSON.stringify(f)}, set=(selector,text)=>{const e=document.querySelector(selector);if(e)e.textContent=text;};
        set('page-head .title span', {index:'阿瓦隆',history:'历史战绩',profile:'完善个人资料',me:'我的'}[${JSON.stringify(pageName)}]);
        document.querySelectorAll('.v3-avatar-letter').forEach(e=>e.textContent=f.data.initial||f.data.profile?.initial||'F');
        const brand=document.querySelector('.brand');if(brand)brand.style.paddingTop=Math.max(Math.min(132,Math.max(96,${height}*132/844)),f.system.statusBarHeight+72)+'px';
        set('.brand-mark>span','A');document.querySelectorAll('.guest-feature>span').forEach((e,i)=>e.textContent=f.data.guestFeatures[i].label);set('.agreement-circle span','✓');document.querySelectorAll('.legal-link').forEach((e,i)=>e.textContent=i?'《隐私政策》':'《用户服务协议》');
        set('.recent-time', (f.data.recent?.timeText||'')+' · 房间 '+(f.data.recent?.roomCode||''));set('.recent-replay','查看复盘 →');
        document.querySelectorAll('.record-filter>span').forEach((e,i)=>e.textContent=['全部','正义','邪恶'][i]);
        const legends=document.querySelectorAll('.record-legend span');if(legends.length){legends[0].textContent='● '+(f.data.stats?.wins||0)+' 胜';legends[1].textContent=(f.data.stats?.losses||0)+' 负 ●';}
        document.querySelectorAll('.history-game').forEach((e,i)=>{e.querySelector('.history-meta>span').textContent=f.data.items[i].timeText;e.querySelector('.history-replay').textContent='查看复盘 →';});
        set('.nickname-heading>span','昵称');document.querySelectorAll('.avatar-source>span').forEach((e,i)=>e.textContent=i?'从相册选择':'使用微信头像');
        document.querySelectorAll('.settings-row>span').forEach((e,i)=>e.textContent=['历史战绩','规则与角色说明','用户服务协议','隐私政策'][i]);
      })()`);
      const boxes = await evaluate(`(() => {const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {wide:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,title:box(document.querySelector('page-head .title')),bar:box(document.querySelector('.tab-bar')),hero:box(document.querySelector('.v3-game-card')),images:[...document.querySelectorAll('img')].map(e=>({src:e.getAttribute('src'),naturalWidth:e.naturalWidth,...box(e)}))};})()`);
      const label = width + 'x' + height + ' ' + f.name;
      assert.ok(boxes.wide <= width + 1, label + ' horizontal overflow');
      if (boxes.title) assert.ok(boxes.title.top >= f.system.statusBarHeight, label + ' unsafe title');
      for (const asset of boxes.images) { const expected = dimensions[path.basename(asset.src)]; if (expected) { assert.ok(asset.naturalWidth > 0, label + ' missing asset ' + asset.src); assert.ok(Math.abs(asset.width - expected.width) < .1 && Math.abs(asset.height - expected.height) < .1, label + ' distorted asset ' + asset.src); } }
      await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
      const bottom = await evaluate(`(() => {const b=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {logout:b(document.querySelector('.logout-button')),bar:b(document.querySelector('.tab-bar')),sheet:b(document.querySelector('.avatar-sheet')),nav:b(document.querySelector('.v3-nav-wrap'))};})()`);
      if (bottom.nav) assert.ok(Math.abs(bottom.nav.top) < 1, label + ' header scrolls into system status area');
      if (bottom.logout) assert.ok(bottom.logout.bottom <= bottom.bar.top - 1, label + ' logout covered by tab bar');
      await evaluate('window.scrollTo(0,0)');
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, width + '-' + height + '-' + f.name + '.png'), Buffer.from(capture.data, 'base64'));
      reports.push({ width, height, name: f.name, boxes });
    }
    fs.writeFileSync(path.join(output, 'responsive-report.json'), JSON.stringify(reports, null, 2)); console.log('V3_LAYOUT', reports.length, 'screens');
  } finally { if (cdp) cdp.ws.close(); chrome.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
