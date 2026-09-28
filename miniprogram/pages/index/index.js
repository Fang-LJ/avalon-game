const auth = require('../../services/auth');
const api = require('../../services/avalon');
const ui = require('../../utils/presentation');
Page({
  data: {
    profile: null,
    recent: null,
    currentRoom: null,
    loading: true,
    error: '',
    mockLogin: false,
    mockUsers: [],
    switchingMock: false,
  },
  onShow() {
    if (!auth.requireSession()) return;
    this.load();
  },
  load() {
    this.setData({
      loading: true,
      error: '',
      mockLogin: auth.isMockLogin(),
      mockUsers: auth.isMockLogin() ? auth.MOCK_USERS : [],
    });
    return Promise.all([api.profile(), api.history(1, 1), api.currentRoom()])
      .then(([profile, history, currentRoom]) =>
        this.setData({
          profile: { ...profile, initial: ui.initial(profile.nickname) },
          recent: history.items[0] ? ui.historyItem(history.items[0]) : null,
          currentRoom,
          currentMockKey: auth.currentMockUser().key,
        }),
      )
      .catch(() => this.setData({ error: '加载失败，点击重试' }))
      .finally(() => this.setData({ loading: false }));
  },
  create() {
    wx.navigateTo({ url: '/pages/create/create' });
  },
  join() {
    wx.navigateTo({ url: '/pages/join/join' });
  },
  replay() {
    if (this.data.recent)
      wx.navigateTo({
        url: `/pages/replay/replay?gameId=${this.data.recent.gameId}`,
      });
  },
  returnRoom() {
    wx.navigateTo({
      url: `/pages/room/room?roomId=${this.data.currentRoom.roomId}`,
    });
  },
  selectMockUser(e) {
    if (!auth.isMockLogin() || this.data.switchingMock) return;
    this.setData({ switchingMock: true });
    auth
      .selectMockUser(e.currentTarget.dataset.key)
      .then(() => this.load())
      .catch(() => {})
      .finally(() => this.setData({ switchingMock: false }));
  },
  rules: ui.showRules,
});
