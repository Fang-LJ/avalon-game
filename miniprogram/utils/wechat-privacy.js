// Platform authorization stays separate from our locally stored legal consent.
// No onNeedPrivacyAuthorization listener is registered: WeChat shows its official popup.
function requirePlatformPrivacy() {
  if (!wx.requirePrivacyAuthorize) return Promise.reject(new Error('请更新微信后选择头像，或继续使用默认头像'));
  return new Promise((resolve, reject) => wx.requirePrivacyAuthorize({
    success: resolve,
    fail: () => reject(new Error('尚未同意微信隐私保护指引，可继续使用默认头像')),
  }));
}
module.exports = { requirePlatformPrivacy };
