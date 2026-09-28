const api = require('../../services/avalon');
const auth = require('../../services/auth');
const { rules } = require('../../utils/presentation');
Page({
  data: {
    counts: [5, 6, 7, 8, 9, 10],
    maxPlayers: 8,
    rule: rules(8),
    loading: false,
  },
  onShow() {
    auth.requireSession();
  },
  selectCount(e) {
    const maxPlayers = Number(e.currentTarget.dataset.count);
    this.setData({ maxPlayers, rule: rules(maxPlayers) });
  },
  submit() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    api
      .createRoom({ maxPlayers: this.data.maxPlayers })
      .then((room) =>
        wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}` }),
      )
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  },
});
