const { request } = require('../utils/request');
const tokenStore = require('../utils/token');
const { getConfig } = require('../utils/config');
const MOCK_KEY = 'AVALON_MOCK_USER';
const MOCK_USERS = Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), mockOpenid: `avalon_mock_${i + 1}`, nickname: `玩家${i + 1}` }));
let loginPromise = null;
let loginGeneration = 0;
function currentMockUser() { const key = wx.getStorageSync(MOCK_KEY) || '1'; return MOCK_USERS.find(u => u.key === key) || MOCK_USERS[0]; }
function login() {
  if (getConfig().mockLogin) return request({ url: '/api/auth/wx-login', method: 'POST', requireAuth: false, data: currentMockUser() });
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
    .then(result => request({ url: '/api/auth/wx-login', method: 'POST', requireAuth: false, data: { code: result.code } }));
}
function ensureLogin() {
  if (tokenStore.getToken()) return Promise.resolve();
  if (loginPromise) return loginPromise;
  const generation = ++loginGeneration;
  loginPromise = login().then(result => {
    if (generation === loginGeneration) tokenStore.setToken(result.token);
  }).then(result => {
    if (generation === loginGeneration) loginPromise = null;
    return result;
  }, error => {
    if (generation === loginGeneration) loginPromise = null;
    throw error;
  });
  return loginPromise;
}
function selectMockUser(key) {
  if (!MOCK_USERS.some(user => user.key === String(key))) return Promise.reject(new Error('无效的模拟用户'));
  loginGeneration += 1;
  loginPromise = null;
  wx.setStorageSync(MOCK_KEY, String(key));
  tokenStore.clearToken();
  return ensureLogin();
}
function isMockLogin() { return Boolean(getConfig().mockLogin); }
module.exports = { ensureLogin, selectMockUser, currentMockUser, isMockLogin, MOCK_USERS };
