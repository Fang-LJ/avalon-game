const { request } = require('../utils/request');
const tokenStore = require('../utils/token');
const { getConfig, getEnvironment } = require('../utils/config');
const consent = require('../utils/legal-consent');
const diagnostics = require('../utils/diagnostics');
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
function hasAgreementConsent() { return consent.isCurrent(tokenStore.getToken()); }
function cancelLogin() { generation++; loginPromise = null; }
function setAgreementConsent(agreed) {
  cancelLogin();
  if (agreed) return consent.accept(tokenStore.getToken());
  consent.clear();
}
function login() {
  if (!hasAgreementConsent()) return Promise.reject(new Error('请先阅读并同意协议'));
  if (loginPromise) return loginPromise;
  const attempt = ++generation;
  if (!isMockLogin()) diagnostics.loginEvent('wx.login started');
  const credentials = isMockLogin()
    ? Promise.resolve(currentMockUser())
    : new Promise((resolve, reject) =>
        wx.login({
          success: (result) => {
            diagnostics.loginEvent(
              result.code
                ? 'wx.login success: code received'
                : 'wx.login success: code missing',
            );
            if (result.code) resolve({ code: result.code });
            else reject(new Error('微信未返回登录凭证，请重试'));
          },
          fail: (error) => {
            diagnostics.loginEvent('wx.login failed', error);
            reject(new Error('微信登录失败，请重试'));
          },
        }),
      );
  loginPromise = credentials
    .then((data) => {
      if (attempt !== generation || !hasAgreementConsent()) throw new Error('登录已取消，请确认协议后重试');
      if (!isMockLogin()) diagnostics.loginEvent('auth wx-login request started');
      return request({
        url: '/api/auth/wx-login',
        method: 'POST',
        requireAuth: false,
        data,
      });
    })
    .then((result) => {
      if (attempt !== generation || !hasAgreementConsent()) throw new Error('登录已取消，请确认协议后重试');
      consent.bindSession(result.token, result.userId);
      tokenStore.setToken(result.token);
      return result;
    })
    .finally(() => {
      if (attempt === generation) loginPromise = null;
    });
  return loginPromise;
}
function validateSession() {
  const token = tokenStore.getToken(), attempt = generation;
  if (!token || !consent.isCurrent(token)) return Promise.resolve(null);
  return request({ url: '/api/avalon/me/profile', showError: false,
    sessionGuard: () => attempt === generation && token === tokenStore.getToken() && consent.isCurrent(token) }).then(profile => {
    if (attempt !== generation || token !== tokenStore.getToken() || !consent.isCurrent(token)) return null;
    const record = consent.receipt();
    if (record.userId != null && profile.userId != null && record.userId !== profile.userId) {
      setAgreementConsent(false); return null;
    }
    return profile;
  }).catch(error => {
    if (attempt !== generation || token !== tokenStore.getToken()) return null;
    if (error.statusCode === 401 || error.code === 'UNAUTHORIZED') {
      tokenStore.clearToken(); return null;
    }
    throw error;
  });
}
function requireSession() {
  if (tokenStore.getToken() && hasAgreementConsent()) return true;
  wx.reLaunch({ url: '/pages/login/login' });
  return false;
}
function logout() {
  cancelLogin();
  consent.clear();
  tokenStore.clearToken();
}
function selectMockUser(key) {
  if (!isMockLogin())
    return Promise.reject(new Error('仅 local 环境允许模拟登录'));
  if (!MOCK_USERS.some((u) => u.key === String(key)))
    return Promise.reject(new Error('无效的模拟用户'));
  if (!hasAgreementConsent()) return Promise.reject(new Error('请先阅读并同意协议'));
  // The user explicitly selected this local account after checking the agreements.
  cancelLogin();
  tokenStore.clearToken();
  consent.bindSession('', null);
  wx.setStorageSync(MOCK_KEY, String(key));
  return login();
}
module.exports = {
  login,
  hasAgreementConsent,
  setAgreementConsent,
  cancelLogin,
  validateSession,
  requireSession,
  logout,
  selectMockUser,
  currentMockUser,
  isMockLogin,
  MOCK_USERS,
};
