const api = require('../../services/avalon');
Page({
  data: { counts: [6, 7, 8], maxPlayers: 6, nickname: '', loading: false },
  selectCount(e) { this.setData({ maxPlayers: Number(e.currentTarget.dataset.count) }); },
  nicknameInput(e) { this.setData({ nickname: e.detail.value }); },
  submit() {
    this.setData({ loading: true });
    api.createRoom({ maxPlayers: this.data.maxPlayers, nickname: this.data.nickname }).then(room => {
      wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}` });
    }).finally(() => this.setData({ loading: false }));
  }
});
