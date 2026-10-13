// All dimensions are CSS pixels, matching WeChat window and capsule APIs.
function navigationMetrics(info = {}, capsule = {}) {
  const status = Math.max(info.statusBarHeight || 20, info.safeArea && info.safeArea.top || 0);
  const navTop = Math.max(status + 4, capsule.top || 0);
  const navHeight = Math.max(32, capsule.height || (capsule.top && capsule.bottom ? capsule.bottom - capsule.top : 32));
  const contentTop = Math.max(navTop + navHeight, capsule.bottom || 0) + 12;
  const navWidth = Math.max(0, (capsule.left || info.windowWidth || 320) - 32);
  return { navTop, navHeight, navWidth, contentTop };
}
function readNavigationMetrics() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
  const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : {};
  return navigationMetrics(info, capsule || {});
}
module.exports = { navigationMetrics, readNavigationMetrics };
