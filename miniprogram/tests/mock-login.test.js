const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('production client cannot submit mock login while local keeps ten test identities', () => {
  const storage = {};
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: key => { delete storage[key]; }
  };

  const auth = require('../services/auth');
  const config = require('../utils/config').getConfig();
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'config.js'), 'utf8');

  assert.equal(config.mockLogin, false);
  assert.equal(auth.isMockLogin(), false);
  assert.equal(auth.MOCK_USERS.length, 10);
  assert.equal(auth.MOCK_USERS[0].mockOpenid, 'avalon_mock_1');
  assert.equal(auth.MOCK_USERS[9].mockOpenid, 'avalon_mock_10');
  assert.match(source, /local:.*mockLogin: true/);
  assert.match(source, /prod:.*mockLogin: false/);
  assert.doesNotMatch(source, /mock:\s*\{/);
});
