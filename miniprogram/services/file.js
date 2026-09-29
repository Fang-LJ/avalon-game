const { getConfig } = require('../utils/config');
const tokenStore = require('../utils/token');

function uploadError(message, code, statusCode, response) {
  const error = new Error(message || '上传失败');
  error.code = code || 'UPLOAD_ERROR';
  error.statusCode = statusCode;
  error.response = response;
  return error;
}

function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success(result) {
        const selected = result.tempFiles && result.tempFiles[0];
        if (!selected || !selected.tempFilePath) {
          reject(uploadError('未选择图片', 'PARAM_ERROR'));
          return;
        }
        resolve(selected.tempFilePath);
      },
      fail(error) {
        reject(uploadError(error.errMsg || '选择图片失败', 'CHOOSE_IMAGE_ERROR'));
      },
    });
  });
}

function uploadAvatar(filePath) {
  const token = tokenStore.getToken();
  if (!token) return Promise.reject(uploadError('请先登录', 'UNAUTHORIZED'));
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getConfig().apiBaseUrl}/api/avalon/me/avatar`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      success(result) {
        let body;
        try {
          body = JSON.parse(result.data || '{}');
        } catch (_) {
          reject(uploadError('上传响应解析失败', 'PARSE_ERROR', result.statusCode));
          return;
        }
        if (result.statusCode === 401 || body.code === 'UNAUTHORIZED') {
          tokenStore.clearToken();
          reject(uploadError(body.message || '请先登录', 'UNAUTHORIZED', result.statusCode, body));
          return;
        }
        if (
          result.statusCode < 200 ||
          result.statusCode >= 300 ||
          (body.code && body.code !== 'SUCCESS')
        ) {
          reject(uploadError(body.message || '头像上传失败，请重试', body.code, result.statusCode, body));
          return;
        }
        resolve(body.data === undefined ? body : body.data);
      },
      fail(error) {
        reject(uploadError(error.errMsg || '头像上传失败，请重试', 'NETWORK_ERROR'));
      },
    });
  });
}

module.exports = { chooseImage, uploadAvatar };
