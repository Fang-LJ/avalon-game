const { ROLES, backToLogin } = require('../../utils/guest-content');
const { CARDS } = require('../../utils/cards');
Page({
  data: { roles: ROLES, selectedRole: null, cardBack: CARDS.back.ROLE, overlayTop: 56 },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    this.setData({ overlayTop: Math.max((info.statusBarHeight || 20) + 40, capsule ? capsule.bottom + 12 : 0) });
  },
  openRole(e) { this.setData({ selectedRole: ROLES.find(role => role.code === e.currentTarget.dataset.code) || null }); },
  closeRole() { this.setData({ selectedRole: null }); },
  ignoreTap() {},
  back: backToLogin,
});
