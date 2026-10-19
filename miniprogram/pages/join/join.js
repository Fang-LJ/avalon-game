const api = require('../../services/avalon');
const auth = require('../../services/auth');
const invite = require('../../utils/invite');
function exception(error = {}) {
  const message = error.message || '';
  if (/已满|空座位/.test(message)) return { kind: 'full', title: '房间已满', description: '当前席位已满，无法加入', mark: '7f978' };
  if (error.code === 'INVALID_PHASE' || /已开始|开始后/.test(message)) return { kind: 'started', title: '对局已开始', description: '该邀请已经失效', mark: '52726' };
  if (error.code === 'NOT_FOUND' || /不存在|失效|关闭/.test(message)) return { kind: 'missing', title: '房间不存在', description: '请向好友获取新的邀请', mark: 'aa638' };
  return { kind: 'network', title: '暂时无法读取邀请', description: message || '网络连接失败，请重试', mark: 'aa638' };
}
Page({
 data: { roomCode: '', preview: null, state: null, previewLoading: false, loading: false, error: '', canJoin: false, returning: false },
 onLoad(options = {}) { const roomCode = invite.validRoomCode(options.roomCode); if (roomCode) invite.save(roomCode); this.setData({ roomCode }); },
 onShow() { this._active = true; this.setData({ loading: !!this._joining }); if (auth.requireSession()) this.loadPreview(); },
 onHide() { this._active = false; this._previewRequest = (this._previewRequest || 0) + 1; },
 onUnload() { this.onHide(); },
 async loadPreview() {
  if (this.data.loading) return;
  const roomCode = invite.validRoomCode(this.data.roomCode);
  if (!roomCode) { this.setData({ state: exception({ code: 'NOT_FOUND' }), canJoin: false }); return; }
  if (!auth.requireSession()) return;
  const request = this._previewRequest = (this._previewRequest || 0) + 1;
  this.setData({ previewLoading: true, state: null, error: '', canJoin: false });
  try {
   const preview = await api.invitePreview(roomCode);
   if (!this._active || request !== this._previewRequest) return;
   const returning = preview.member && preview.status === 'PLAYING';
   let state = null;
   if (preview.status !== 'WAITING' && !returning) state = exception({ code: preview.status === 'PLAYING' ? 'INVALID_PHASE' : 'NOT_FOUND' });
   else if (preview.currentPlayers >= preview.maxPlayers && !preview.member) state = exception({ message: '房间已满' });
   this.setData({ preview, returning, state, canJoin: !state });
  } catch (error) { if (this._active && request === this._previewRequest) this.setData({ state: exception(error), preview: null }); }
  finally { if (this._active && request === this._previewRequest) this.setData({ previewLoading: false }); }
 },
 async submit() {
  if (this.data.loading || this.data.previewLoading || !this.data.canJoin) return;
  const roomCode = invite.validRoomCode(this.data.roomCode); if (!roomCode) return;
  invite.save(roomCode); if (!auth.requireSession()) return;
  this._joining = true;
  this.setData({ loading: true, error: '' });
  try {
   let room;
   if (this.data.returning) room = { roomId: this.data.preview.roomId };
   else {
    room = await api.joinRoom({ roomCode });
    // New members are seated by join(); existing standing members reuse seat().
    if (room.mySeatNo == null && room.status === 'WAITING') {
     const occupied = new Set(room.players.filter(p => p.seatNo != null).map(p => p.seatNo));
     const seatNo = Array.from({ length: room.maxPlayers }, (_, i) => i + 1).find(n => !occupied.has(n));
     if (seatNo) room = await api.seat(room.roomId, seatNo);
    }
   }
   invite.clear(roomCode); if (!this._active) return;
   await new Promise((resolve, reject) => wx.redirectTo({ url: `/pages/room/room?roomId=${room.roomId}`, success: resolve, fail: () => reject(new Error('已加入房间，页面打开失败，请重试')) }));
  } catch (error) {
   if (!this._active) return;
   const state = exception(error);
   if (state.kind === 'network') this.setData({ error: error.message || '加入失败，请重试' });
   else { this.setData({ state, canJoin: false }); if (error.code === 'NOT_FOUND') this._refreshAfterJoin = true; }
  } finally {
   this._joining = false;
   if (this._active) {
    this.setData({ loading: false });
    if (this._refreshAfterJoin) { this._refreshAfterJoin = false; await this.loadPreview(); }
   }
  }
 },
 decline() { if (this.data.loading) return; invite.clear(this.data.roomCode); wx.reLaunch({ url: '/pages/index/index' }); },
});
