const api = require('../../services/avalon');
const auth = require('../../services/auth');
const invite = require('../../utils/invite');
Page({
  data: { roomCode: '', valid: false, loading: false, fromInvite: false, inputFocus: false, error: '' },
  onLoad(options = {}) {
    const code = invite.validRoomCode(options.roomCode);
    if (code) {
      invite.save(code);
      this.setData({ roomCode: code, valid: true, fromInvite: true });
    }
  },
  onShow() {
    auth.requireSession();
  },
  codeInput(e) {
    const roomCode = String(e.detail.value).replace(/\D/g, '').slice(0, 6);
    this.setData({ roomCode, valid: !!invite.validRoomCode(roomCode), error: '' });
  },
  editCode() {
    if (!this.data.loading)
      this.setData({ roomCode: '', valid: false, fromInvite: false, inputFocus: true, error: '' });
  },
  submit() {
    if (this.data.loading || !this.data.valid) return;
    const roomCode = invite.validRoomCode(this.data.roomCode);
    if (!roomCode) return;
    invite.save(roomCode);
    if (!auth.requireSession()) return;
    this.setData({ loading: true, error: '' });
    return api
      .joinRoom({ roomCode })
      .then((room) => {
        invite.clear(roomCode);
        wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}` });
      })
      .catch((error) => this.setData({ error: error.message || '加入失败，请检查房间号后重试' }))
      .finally(() => this.setData({ loading: false }));
  },
});
