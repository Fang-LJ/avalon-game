const auth = require('../../services/auth');
const api = require('../../services/avalon');
Page({
  data: {
    currentRoom: null,
    mockLogin: auth.isMockLogin(),
    mockUsers: auth.MOCK_USERS,
    currentMockKey: auth.currentMockUser().key,
    switchingMock: false
  },
  onShow() {
    this.setData({ currentMockKey: auth.currentMockUser().key });
    this.loadCurrentRoom();
  },
  loadCurrentRoom() {
    auth.ensureLogin().then(() => api.currentRoom()).then(currentRoom => this.setData({ currentRoom })).catch(error => {
      if (!this.data.mockLogin || !error || error.code !== 'UNAUTHORIZED') return;
      auth.selectMockUser(this.data.currentMockKey)
        .then(() => api.currentRoom())
        .then(currentRoom => this.setData({ currentRoom }))
        .catch(() => {});
    });
  },
  selectMockUser(event) {
    const key = String(event.currentTarget.dataset.key);
    if (this.data.switchingMock) return;
    this.setData({ switchingMock: true, currentRoom: null });
    auth.selectMockUser(key)
      .then(() => api.currentRoom())
      .then(currentRoom => {
        this.setData({ currentMockKey: key, currentRoom, switchingMock: false });
        wx.showToast({ title: `已切换为玩家${key}`, icon: 'none' });
      })
      .catch(() => this.setData({ switchingMock: false }));
  },
  create() { wx.navigateTo({ url: '/pages/create/create' }); },
  join() { wx.navigateTo({ url: '/pages/join/join' }); },
  returnRoom() { wx.navigateTo({ url: `/pages/room/room?roomId=${this.data.currentRoom.roomId}` }); }
});
