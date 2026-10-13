const auth = require('../../services/auth');
const invite = require('../../utils/invite');
const { navigationMetrics } = require('../../utils/guest-navigation');
const { ROUTES } = require('../../utils/guest-content');
Page({
  data: {
    agreed: false,
    busy: false,
    checking: true,
    error: '',
    mockLogin: false,
    mockUsers: [],
    currentMockKey: '1',
    brandTop: 90,
    guestFeatures: [
      { key: 'rules', label: '游戏规则', icon: 'book' },
      { key: 'roles', label: '角色介绍', icon: 'people' },
      { key: 'configuration', label: '人数配置', icon: 'calculator' },
      { key: 'demo', label: '体验玩法', icon: 'gamepad' },
    ],
  },
  onLoad() {
    this.updateLayout();
    this.setData({
      mockLogin: auth.isMockLogin(),
      mockUsers: auth.isMockLogin() ? auth.MOCK_USERS : [],
      currentMockKey: auth.currentMockUser().key,
    });
  },
  onResize() { this.updateLayout(); },
  updateLayout() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : {};
    this.setData({ brandTop: Math.max(90, navigationMetrics(info, capsule || {}).contentTop + 20) });
  },
  onShow() {
    this.visible = true;
    const epoch = this.epoch = (this.epoch || 0) + 1;
    const agreed = auth.hasAgreementConsent();
    this.setData({ agreed, checking: agreed, busy: false });
    if (!agreed) return;
    return auth.validateSession()
      .then(profile => {
        if (this.visible && epoch === this.epoch && auth.hasAgreementConsent() && profile) this.goAfterLogin(profile);
      })
      .catch(() => {
        if (this.visible && epoch === this.epoch) this.setData({ error: '无法验证登录状态，请检查网络后重试' });
      })
      .finally(() => {
        if (this.visible && epoch === this.epoch) this.setData({ checking: false, agreed: auth.hasAgreementConsent() });
      });
  },
  onHide() { this.visible = false; this.epoch = (this.epoch || 0) + 1; auth.cancelLogin(); },
  onUnload() { this.onHide(); },
  toggleAgreement() {
    // The links have their own handlers; reading never enters this path.
    try {
      const agreed = !this.data.agreed;
      auth.setAgreementConsent(agreed);
      this.epoch = (this.epoch || 0) + 1;
      this.setData({ agreed: agreed && auth.hasAgreementConsent(), busy: false, checking: false, error: '' });
    } catch (e) { this.setData({ agreed: false, error: e.message || '无法保存同意记录，请重试' }); }
  },
  login() {
    if (!this.data.agreed || !auth.hasAgreementConsent() || this.data.busy || this.data.checking) return;
    return this.perform(() => auth.login());
  },
  openLegal(e) {
    const type = e.currentTarget.dataset.type;
    if (['agreement', 'privacy'].includes(type)) wx.navigateTo({ url: `/pages/legal/legal?type=${type}` });
  },
  openGuestFeature(e) {
    const url = ROUTES[e.currentTarget.dataset.key];
    if (url) wx.navigateTo({ url });
  },
  perform(task) {
    if (!this.data.agreed || !auth.hasAgreementConsent() || this.data.busy) return;
    const epoch = this.epoch = (this.epoch || 0) + 1;
    this.setData({ busy: true, error: '' });
    return Promise.resolve().then(() => {
      if (!this.visible || epoch !== this.epoch || !this.data.agreed || !auth.hasAgreementConsent()) throw new Error('登录已取消');
      return task();
    })
      .then(result => {
        if (this.visible && epoch === this.epoch && this.data.agreed && auth.hasAgreementConsent()) this.goAfterLogin(result);
      })
      .catch(e => { if (this.visible && epoch === this.epoch) this.setData({ error: e.message || '登录失败，请重试' }); })
      .finally(() => { if (this.visible && epoch === this.epoch) this.setData({ busy: false }); });
  },
  goAfterLogin(result) {
    const needsProfile =
      !auth.isMockLogin() &&
      result && result.isNewUser === true &&
      (result.profileComplete === false ||
        (result.profileComplete == null && !result.avatarUrl));
    wx.reLaunch({
      url: needsProfile ? '/pages/profile/profile' : invite.destinationOrHome(),
    });
  },
  selectMockUser(e) {
    if (!this.data.agreed || !auth.hasAgreementConsent() || !auth.isMockLogin() || this.data.busy || this.data.checking) return;
    return this.perform(() => auth.selectMockUser(e.currentTarget.dataset.key));
  },
});
