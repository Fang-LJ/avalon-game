const { request } = require('../utils/request');
const tokenStore = require('../utils/token');
const { getEnvironment } = require('../utils/config');
const MOCK_KEY = 'AVALON_MOCK_USER';
const MOCK_USERS = Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), mockOpenid: `avalon_mock_${i + 1}`, nickname: `玩家${i + 1}` }));
function currentMockUser() { const key = wx.getStorageSync(MOCK_KEY) || '1'; return MOCK_USERS.find(u => u.key === key) || MOCK_USERS[0]; }
function login() {
  if (getEnvironment() === 'local') return request({ url: '/api/auth/wx-login', method: 'POST', requireAuth: false, data: currentMockUser() });
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
    .then(result => request({ url: '/api/auth/wx-login', method: 'POST', requireAuth: false, data: { code: result.code } }));
}
function ensureLogin() { if (tokenStore.getToken()) return Promise.resolve(); return login().then(result => tokenStore.setToken(result.token)); }
function selectMockUser(key) { wx.setStorageSync(MOCK_KEY, key); tokenStore.clearToken(); return ensureLogin(); }
module.exports = { ensureLogin, selectMockUser, currentMockUser, MOCK_USERS };
