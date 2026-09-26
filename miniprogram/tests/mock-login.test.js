const test = require('node:test');
const assert = require('node:assert/strict');

test('remote mock mode switches among eight users and stores the new token', async () => {
  const storage = {};
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: key => { delete storage[key]; },
    request(options) {
      assert.equal(options.url, 'https://api.playmatespace.cloud/avalon/api/auth/wx-login');
      assert.equal(options.data.mockOpenid, 'avalon_mock_8');
      options.success({ statusCode: 200, data: { code: 'SUCCESS', data: { token: 'mock-token-8' } } });
    }
  };

  const auth = require('../services/auth');
  assert.equal(auth.isMockLogin(), true);
  assert.equal(auth.MOCK_USERS.length, 8);
  await auth.selectMockUser('8');
  assert.equal(auth.currentMockUser().nickname, '玩家8');
  assert.equal(storage.AVALON_GAME_TOKEN, 'mock-token-8');
});
