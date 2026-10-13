const agreement = require('../../utils/legal/user-agreement');
const privacy = require('../../utils/legal/privacy-policy');
Page({
  data: { document: null },
  onLoad(options = {}) { this.setData({ document: options.type === 'privacy' ? privacy : agreement }); },
  back() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/login/login' });
  },
});
