const api = require('../../services/avalon');
const auth = require('../../services/auth');
Page({
  data: { roomCode: '', valid: false, loading: false },
  onShow() {
    auth.requireSession();
  },
  codeInput(e) {
    const roomCode = String(e.detail.value).replace(/\D/g, '').slice(0, 6);
    this.setData({ roomCode, valid: /^\d{6}$/.test(roomCode) });
  },
  submit() {
    if (this.data.loading || !this.data.valid) return;
    this.setData({ loading: true });
    api
      .joinRoom({ roomCode: this.data.roomCode })
      .then((room) =>
        wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}` }),
      )
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  },
});
