const auth = require('../../services/auth');
const invite = require('../../utils/invite');
const { showLegal } = require('../../utils/presentation');
const { ROUTES } = require('../../utils/guest-content');
Page({
  data: {
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
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    this.setData({
      brandTop: Math.max((info.statusBarHeight || 20) + 52, capsule ? capsule.bottom + 32 : 90),
      mockLogin: auth.isMockLogin(),
      mockUsers: auth.isMockLogin() ? auth.MOCK_USERS : [],
      currentMockKey: auth.currentMockUser().key,
    });
  },
  onShow() {
    this.setData({ checking: true });
    auth
      .validateSession()
      .then((profile) => {
        if (profile) this.goAfterLogin(profile);
      })
      .catch(() =>
        this.setData({ error: '无法验证登录状态，请检查网络后重试' }),
      )
      .finally(() => this.setData({ checking: false }));
  },
  login() {
    if (this.data.busy || this.data.checking) return;
    this.perform(() => auth.login());
  },
  openGuestFeature(e) {
    const url = ROUTES[e.currentTarget.dataset.key];
    if (url) wx.navigateTo({ url });
  },
  perform(task) {
    this.setData({ busy: true, error: '' });
    return task()
      .then((result) => this.goAfterLogin(result))
      .catch((e) => this.setData({ error: e.message || '登录失败，请重试' }))
      .finally(() => this.setData({ busy: false }));
  },
  goAfterLogin(result) {
    const needsProfile =
      !auth.isMockLogin() &&
      result &&
      (result.profileComplete === false ||
        (result.profileComplete == null && !result.avatarUrl));
    wx.reLaunch({
      url: needsProfile ? '/pages/profile/profile' : invite.destinationOrHome(),
    });
  },
  selectMockUser(e) {
    if (!auth.isMockLogin() || this.data.busy) return;
    this.perform(() => auth.selectMockUser(e.currentTarget.dataset.key));
  },
  legal: showLegal,
});
