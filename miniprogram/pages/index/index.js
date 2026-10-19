const auth = require('../../services/auth');
const api = require('../../services/avalon');
const ui = require('../../utils/presentation');
const { historyCard } = require('../../utils/history-presentation');
const invite = require('../../utils/invite');
const { readNavigationMetrics } = require('../../utils/guest-navigation');

function localGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '凌晨好';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
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
    greeting: '',
    headerTop: 88,
    joinOpen: false,
    joinCode: '',
    joinValid: false,
    joinFocus: false,
    joining: false,
    joinError: '',
    joinKeyboardHeight: 0,
    joinSafeTop: 88,
  },
  onShow() {
    if (!auth.requireSession()) return;
    this.setData({ greeting: localGreeting(), headerTop: readNavigationMetrics().contentTop });
    this.load();
  },
  onUnload() {
    this._unloaded = true;
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
          recent: history.items[0] ? historyCard(history.items[0]) : null,
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
    if (this.data.joining || !auth.requireSession()) return;
    this.setData({
      joinOpen: true, joinCode: '', joinValid: false, joinError: '',
      joinFocus: true, joinKeyboardHeight: 0,
      joinSafeTop: readNavigationMetrics().contentTop,
    });
  },
  closeJoin() {
    if (this.data.joining) return;
    if (this._joinPendingCode) invite.clear(this._joinPendingCode);
    this._joinPendingCode = '';
    this.setData({ joinOpen: false, joinFocus: false, joinKeyboardHeight: 0 });
    wx.hideKeyboard();
  },
  keepJoinOpen() {},
  joinInput(e) {
    if (this.data.joining) return;
    const joinCode = String(e.detail.value).replace(/\D/g, '').slice(0, 6);
    this.setData({ joinCode, joinValid: !!invite.validRoomCode(joinCode), joinError: '' });
    return joinCode;
  },
  joinKeyboardChange(e) {
    if (this.data.joinOpen)
      this.setData({ joinKeyboardHeight: Math.max(0, Number(e.detail.height) || 0) });
  },
  async submitJoin() {
    if (!this.data.joinOpen || this.data.joining) return;
    const roomCode = invite.validRoomCode(this.data.joinCode);
    if (!roomCode) return;
    // Use the invitation page's validator and pending intent, including session recovery.
    invite.save(roomCode);
    this._joinPendingCode = roomCode;
    if (!auth.requireSession()) return;
    this.setData({ joining: true, joinError: '', joinFocus: false });
    wx.hideKeyboard();
    try {
      const room = await api.joinRoom({ roomCode });
      invite.clear(roomCode);
      this._joinPendingCode = '';
      if (this._unloaded) return;
      await new Promise((resolve, reject) => wx.navigateTo({
        url: `/pages/room/room?roomId=${room.roomId}`,
        success: resolve,
        fail: () => reject(new Error('已加入房间，页面打开失败，请重试')),
      }));
      if (!this._unloaded)
        this.setData({ joinOpen: false, joinFocus: false, joinKeyboardHeight: 0 });
    } catch (error) {
      if (!this._unloaded)
        this.setData({ joinError: error.message || '加入失败，请检查房间号后重试' });
    } finally {
      if (!this._unloaded) this.setData({ joining: false });
    }
  },
  history() { wx.reLaunch({ url: '/pages/history/history' }); },
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
