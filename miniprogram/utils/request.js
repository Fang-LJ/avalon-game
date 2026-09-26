const { getConfig } = require('./config');
const tokenStore = require('./token');

function request({ url, method = 'GET', data, requireAuth = true, showError = true }) {
  const header = { 'content-type': 'application/json' };
  if (requireAuth && tokenStore.getToken()) header.Authorization = `Bearer ${tokenStore.getToken()}`;
  return new Promise((resolve, reject) => wx.request({
    url: `${getConfig().apiBaseUrl}${url}`, method, data, header,
    success(res) {
      const body = res.data || {};
      if (res.statusCode === 401 || body.code === 'UNAUTHORIZED') tokenStore.clearToken();
      if (res.statusCode >= 200 && res.statusCode < 300 && (!body.code || body.code === 'SUCCESS')) return resolve(body.data === undefined ? body : body.data);
      if (showError) wx.showToast({ title: body.message || '请求失败', icon: 'none' });
      const error = new Error(body.message || '请求失败'); error.code = body.code; error.statusCode = res.statusCode; reject(error);
    },
    fail(error) { if (showError) wx.showToast({ title: '网络连接失败', icon: 'none' }); reject(error); }
  }));
}
module.exports = { request };
