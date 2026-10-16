const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(authorized, supported = true) {
  const calls = [], modules = new Map();
  const wx = { chooseMedia: o => { calls.push('album'); o.success({ tempFiles: [{ tempFilePath: 'wxfile://avatar' }] }); } };
  if (supported) wx.requirePrivacyAuthorize = o => { calls.push('platform authorization'); authorized ? o.success({}) : o.fail({ errMsg: 'denied' }); };
  const root = path.resolve(__dirname, '..');
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, wx, require: name => load(path.resolve(path.dirname(file), name + '.js')) });
    return module.exports;
  }
  return { calls, file: load(path.join(root, 'services/file.js')) };
}
test('album access follows successful independent platform authorization', async () => {
  const f = fixture(true); assert.equal(await f.file.chooseImage(), 'wxfile://avatar');
  assert.deepEqual(f.calls, ['platform authorization', 'album']);
});
test('platform privacy refusal cannot open album and does not synthesize authorization', async () => {
  const f = fixture(false); await assert.rejects(f.file.chooseImage(), /默认头像/);
  assert.deepEqual(f.calls, ['platform authorization']);
});
test('unsupported privacy API keeps default-avatar fallback and cannot silently open album', async () => {
  const f = fixture(false, false); await assert.rejects(f.file.chooseImage(), /更新微信/); assert.deepEqual(f.calls, []);
});
test('avatar selection and nickname suggestions remain user-triggered with no startup privacy prompt', () => {
  const profile = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.wxml'), 'utf8');
  assert.match(profile, /open-type="chooseAvatar"/); assert.match(profile, /type="nickname"/);
  assert.doesNotMatch(profile, /getPhoneNumber|getUserProfile/);
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'); assert.doesNotMatch(app, /requirePrivacyAuthorize|onNeedPrivacyAuthorization|authorize/);
  const platform = fs.readFileSync(path.join(__dirname, '../utils/wechat-privacy.js'), 'utf8');
  assert.doesNotMatch(platform, /legal-consent|event:\s*['"]agree|setStorageSync/);
});
