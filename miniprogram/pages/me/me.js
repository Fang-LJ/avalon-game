const api = require('../../services/avalon');
const auth = require('../../services/auth');
const ui = require('../../utils/presentation');
Page({
  data: {
    profile: null,
    stats: null,
    commonRoles: '暂无对局',
    error: '',
    mockLogin: false,
  },
  onShow() {
    if (auth.requireSession()) this.load();
  },
  async load() {
    try {
      const [profile, stats] = await Promise.all([api.profile(), api.stats()]);
      this.setData({
        profile: { ...profile, initial: ui.initial(profile.nickname) },
        stats,
        commonRoles:
          stats.roleCounts
            .slice(0, 3)
            .map((r) => r.roleName + ' ' + r.games + ' 局')
            .join(' · ') || '暂无对局',
        error: '',
        mockLogin: auth.isMockLogin(),
      });
    } catch (_) {
      this.setData({ error: '个人信息加载失败，点击重试' });
    }
  },
  editNickname() {
    wx.showModal({
      title: '编辑昵称',
      editable: true,
      placeholderText: '1–32 个字符',
      content: this.data.profile.nickname,
      success: (r) => {
        if (r.confirm)
          api
            .updateProfile(r.content)
            .then(() => this.load())
            .catch(() => {});
      },
    });
  },
  history() {
    wx.reLaunch({ url: '/pages/history/history' });
  },
  rules: ui.showRules,
  legal: ui.showLegal,
  about() {
    wx.showModal({
      title: '关于阿瓦隆',
      content:
        'Avalon Game V1 · 5–10 人在线阵营推理桌游。邀请朋友，用逻辑与信任寻找同伴。',
      showCancel: false,
    });
  },
  logout() {
    auth.logout();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
