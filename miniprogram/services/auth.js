const { request } = require('../utils/request');
const tokenStore = require('../utils/token');
const { getConfig, getEnvironment } = require('../utils/config');
const MOCK_KEY = 'AVALON_MOCK_USER';
const MOCK_USERS = Array.from({ length: 10 }, (_, i) => ({
  key: String(i + 1),
  mockOpenid: `avalon_mock_${i + 1}`,
  nickname: `玩家${i + 1}`,
}));
let loginPromise = null;
let generation = 0;
function isMockLogin() {
  return getEnvironment() === 'local' && getConfig().mockLogin === true;
}
function currentMockUser() {
  return (
    MOCK_USERS.find((u) => u.key === (wx.getStorageSync(MOCK_KEY) || '1')) ||
    MOCK_USERS[0]
  );
}
function login() {
  if (loginPromise) return loginPromise;
  const attempt = ++generation;
  const credentials = isMockLogin()
    ? Promise.resolve(currentMockUser())
    : new Promise((resolve, reject) =>
        wx.login({
          success: (result) =>
            result.code
              ? resolve({ code: result.code })
              : reject(new Error('微信未返回登录凭证，请重试')),
          fail: () => reject(new Error('微信登录失败，请重试')),
        }),
      );
  loginPromise = credentials
    .then((data) =>
      request({
        url: '/api/auth/wx-login',
        method: 'POST',
        requireAuth: false,
        data,
      }),
    )
    .then((result) => {
      if (attempt !== generation) throw new Error('登录已取消');
      tokenStore.setToken(result.token);
      return result;
    })
    .finally(() => {
      if (attempt === generation) loginPromise = null;
    });
  return loginPromise;
}
function validateSession() {
  if (!tokenStore.getToken()) return Promise.resolve(null);
  return request({ url: '/api/avalon/me/profile', showError: false }).catch(
    (error) => {
      if (error.statusCode === 401 || error.code === 'UNAUTHORIZED') {
        tokenStore.clearToken();
        return null;
      }
      throw error;
    },
  );
}
function requireSession() {
  if (tokenStore.getToken()) return true;
  wx.reLaunch({ url: '/pages/login/login' });
  return false;
}
function logout() {
  generation++;
  loginPromise = null;
  tokenStore.clearToken();
}
function selectMockUser(key) {
  if (!isMockLogin())
    return Promise.reject(new Error('仅 local 环境允许模拟登录'));
  if (!MOCK_USERS.some((u) => u.key === String(key)))
    return Promise.reject(new Error('无效的模拟用户'));
  logout();
  wx.setStorageSync(MOCK_KEY, String(key));
  return login();
}
module.exports = {
  login,
  validateSession,
  requireSession,
  logout,
  selectMockUser,
  currentMockUser,
  isMockLogin,
  MOCK_USERS,
};
