const test = require('node:test');
const assert = require('node:assert/strict');

test('remote mock mode switches among ten users and stores the new token', async () => {
  const storage = {};
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: key => { delete storage[key]; },
    request(options) {
      assert.equal(options.url, 'https://api.playmatespace.cloud/avalon/api/auth/wx-login');
      assert.equal(options.data.mockOpenid, 'avalon_mock_10');
      options.success({ statusCode: 200, data: { code: 'SUCCESS', data: { token: 'mock-token-10' } } });
    }
  };

  const auth = require('../services/auth');
  assert.equal(auth.isMockLogin(), true);
  assert.equal(auth.MOCK_USERS.length, 10);
  await auth.selectMockUser('10');
  assert.equal(auth.currentMockUser().nickname, '玩家10');
  assert.equal(storage.AVALON_GAME_TOKEN, 'mock-token-10');
});
