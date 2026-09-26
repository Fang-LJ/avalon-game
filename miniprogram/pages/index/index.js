const auth = require('../../services/auth');
const api = require('../../services/avalon');
Page({
  data: { currentRoom: null },
  onShow() { auth.ensureLogin().then(() => api.currentRoom()).then(currentRoom => this.setData({ currentRoom })).catch(() => {}); },
  create() { wx.navigateTo({ url: '/pages/create/create' }); },
  join() { wx.navigateTo({ url: '/pages/join/join' }); },
  returnRoom() { wx.navigateTo({ url: `/pages/room/room?roomId=${this.data.currentRoom.roomId}` }); }
});
