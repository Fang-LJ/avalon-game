const { ROLES, backToLogin } = require('../../utils/guest-content');
const { readNavigationMetrics } = require('../../utils/guest-navigation');
const { CARDS } = require('../../utils/cards');
Page({
  data: { roles: ROLES, selectedRole: null, cardBack: CARDS.back.ROLE, overlayTop: 56 },
  onLoad() {
    this.updateLayout();
  },
  onResize() { this.updateLayout(); },
  updateLayout() { this.setData({ overlayTop: readNavigationMetrics().contentTop }); },
  openRole(e) { this.setData({ selectedRole: ROLES.find(role => role.code === e.currentTarget.dataset.code) || null }); },
  closeRole() { this.setData({ selectedRole: null }); },
  ignoreTap() {},
  back: backToLogin,
});
