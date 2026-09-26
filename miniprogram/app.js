const auth = require('./services/auth');
App({
  globalData: { appName: '阿瓦隆', loginPromise: null },
  onLaunch() { this.globalData.loginPromise = auth.ensureLogin(); }
});
