const api = require('../../services/avalon');
Page({
  data: { roomCode: '', nickname: '', loading: false },
  codeInput(e) { this.setData({ roomCode: String(e.detail.value).replace(/\D/g, '').slice(0, 6) }); },
  nicknameInput(e) { this.setData({ nickname: e.detail.value }); },
  submit() {
    this.setData({ loading: true });
    api.joinRoom({ roomCode: this.data.roomCode, nickname: this.data.nickname }).then(room => {
      wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}` });
    }).finally(() => this.setData({ loading: false }));
  }
});
