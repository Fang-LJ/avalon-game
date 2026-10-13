const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { navigationMetrics } = require('../utils/guest-navigation');
const root = path.resolve(__dirname, '..');
for (const [width, status] of [[320,20], [375,44], [390,47], [430,59]]) {
  test(`fixed navigation clears status bar and capsule at ${width}px`, () => {
    const capsule = { top: status + 4, bottom: status + 36, height: 32, left: width - 100 };
    const metrics = navigationMetrics({ windowWidth: width, statusBarHeight: status, safeArea: { top: status } }, capsule);
    assert.ok(metrics.navTop >= status);
    assert.ok(metrics.contentTop > capsule.bottom);
    assert.ok(16 + metrics.navWidth < capsule.left);
    assert.ok(metrics.navHeight >= 32);
  });
}
test('safe area, missing capsule, and unavailable window API have a usable navigation fallback', () => {
  assert.ok(navigationMetrics({ statusBarHeight: 20, safeArea: { top: 59 } }).navTop >= 59);
  assert.ok(navigationMetrics().contentTop >= 56);
  assert.equal(navigationMetrics({ statusBarHeight: 47 }, { bottom: 79 }).navHeight, 32);
});
test('shared header recalculates its safe area on resize and sends the page back event', () => {
  let component, info = { windowWidth: 375, statusBarHeight: 44 }, capsule = { top: 48, bottom: 80, height: 32, left: 275 };
  const nav = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/guest-navigation.js'), 'utf8'), {
    module: nav, wx: { getWindowInfo: () => info, getMenuButtonBoundingClientRect: () => capsule },
  });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/guest-header/guest-header.js'), 'utf8'), {
    Component: value => { component = value; }, require: () => nav.exports,
  });
  const events = [], instance = { ...component.methods, setData: data => { instance.data = data; }, triggerEvent: value => events.push(value) };
  component.lifetimes.attached.call(instance); assert.equal(instance.data.contentTop, 92);
  info = { windowWidth: 430, statusBarHeight: 59 }; capsule = { top: 63, bottom: 95, height: 32, left: 330 };
  component.pageLifetimes.resize.call(instance); assert.equal(instance.data.contentTop, 107);
  instance.back(); assert.deepEqual(events, ['back']);
});
test('all guest pages share one fixed return navigation; the information pages have no bottom return button', () => {
  const css = fs.readFileSync(path.join(root, 'components/guest-header/guest-header.wxss'), 'utf8');
  assert.match(css, /\.guest-nav[^}]*position: fixed/); assert.match(css, /z-index: 200/);
  for (const name of ['guide', 'roles', 'configuration', 'demo-room']) {
    const wxml = fs.readFileSync(path.join(root, `pages/${name}/${name}.wxml`), 'utf8');
    assert.equal((wxml.match(/<guest-header /g) || []).length, 1);
    if (name !== 'demo-room') assert.doesNotMatch(wxml, /<button[^>]*bindtap="back"/);
    else {
      assert.doesNotMatch(wxml, /demo-tools|demo-lobby|demo-exit|添加.*机器人|结束本局|重新开始|机器人会自动|无需登录/);
      assert.match(wxml, /bind:missiontap="openHistory"/); assert.match(wxml, /bindtap="openRole"/);
      assert.match(wxml, /wx:if="{{canEarlyAssassination}}"/);
    }
  }
});
