const { getConfig } = require('./config');
const tokenStore = require('./token');
const diagnostics = require('./diagnostics');

function request({
  url,
  method = 'GET',
  data,
  requireAuth = true,
  showError = true,
}) {
  const header = { 'content-type': 'application/json' };
  if (requireAuth && tokenStore.getToken())
    header.Authorization = `Bearer ${tokenStore.getToken()}`;
  const requestUrl = `${getConfig().apiBaseUrl}${url}`;
  return new Promise((resolve, reject) =>
    wx.request({
      url: requestUrl,
      method,
      data,
      header,
      success(res) {
        diagnostics.httpResponse({
          url: requestUrl,
          method,
          statusCode: res.statusCode,
        });
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 'UNAUTHORIZED') {
          tokenStore.clearToken();
          const pages =
            typeof getCurrentPages === 'function' ? getCurrentPages() : [];
          if (
            requireAuth &&
            pages.length &&
            pages[pages.length - 1].route !== 'pages/login/login'
          )
            wx.reLaunch({ url: '/pages/login/login' });
        }
        if (
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          (!body.code || body.code === 'SUCCESS')
        )
          return resolve(body.data === undefined ? body : body.data);
        if (showError)
          wx.showToast({ title: body.message || '请求失败', icon: 'none' });
        const error = new Error(body.message || '请求失败');
        error.code = body.code;
        error.statusCode = res.statusCode;
        reject(error);
      },
      fail(error) {
        diagnostics.httpFail({ url: requestUrl, method, error, data, header });
        if (showError) wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject(error);
      },
    }),
  );
}
module.exports = { request };
