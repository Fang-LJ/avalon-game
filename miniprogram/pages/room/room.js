const api = require('../../services/avalon');
const socket = require('../../utils/socket');
const PHASES = { ROLE_CONFIRM: '确认身份', TEAM_BUILDING: '队长选人', TEAM_VOTING: '全员投票', MISSION_EXECUTING: '执行任务', MISSION_RESULT: '任务结果', ASSASSINATION: '刺杀梅林', FINISHED: '游戏结束' };
Page({
  data: { roomId: null, room: null, game: null, role: null, displayPlayers: [], selectedIds: [], selectedNames: [], draftKey: '', assassinationTarget: null, isLeader: false, phaseTitle: '', busy: false },
  onLoad(options) { this.setData({ roomId: Number(options.roomId) }); },
  onShow() {
    this.refresh().then(() => { this.stopSocket = socket.connect(() => this.refresh()); });
    this.poller = setInterval(() => this.refresh(), 5000);
  },
  onHide() { if (this.stopSocket) this.stopSocket(); clearInterval(this.poller); },
  onUnload() { if (this.stopSocket) this.stopSocket(); clearInterval(this.poller); },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },
  refresh() {
    return api.room(this.data.roomId).then(room => {
      this.setData({ room });
      if (!room.currentGameId) { this.decoratePlayers(room, null); return null; }
      return api.game(room.currentGameId).then(game => {
        const draftKey = `${game.missionNo}-${game.proposalNo}`;
        let selectedIds = game.selectedPlayerIds;
        if (game.phase === 'TEAM_BUILDING') selectedIds = this.data.draftKey === draftKey ? this.data.selectedIds : [];
        if (game.phase === 'ASSASSINATION') selectedIds = this.data.selectedIds;
        this.setData({ game, selectedIds, draftKey: game.phase === 'TEAM_BUILDING' ? draftKey : '', phaseTitle: PHASES[game.phase] || game.phase, isLeader: game.leaderPlayerId === room.myPlayerId });
        this.decoratePlayers(room, { selectedPlayerIds: selectedIds });
        if (game.phase === 'ROLE_CONFIRM') return api.myRole(game.gameId).then(role => this.setData({ role }));
        return null;
      });
    }).catch(error => { if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') wx.reLaunch({ url: '/pages/index/index' }); });
  },
  decoratePlayers(room, game) {
    const chosen = new Set(game ? game.selectedPlayerIds : this.data.selectedIds);
    const displayPlayers = room.players.map(p => ({ ...p, selected: chosen.has(p.playerId) }));
    const selectedNames = displayPlayers.filter(p => chosen.has(p.playerId)).map(p => `${p.seatNo}号 ${p.nickname}`);
    this.setData({ displayPlayers, selectedNames });
  },
  togglePlayer(e) {
    if (!this.data.game) return;
    const id = Number(e.currentTarget.dataset.id);
    if (this.data.game.phase === 'TEAM_BUILDING' && this.data.isLeader) {
      let ids = this.data.selectedIds.slice(); const index = ids.indexOf(id);
      if (index >= 0) ids.splice(index, 1); else if (ids.length < this.data.game.requiredTeamSize) ids.push(id);
      this.setData({ selectedIds: ids }); this.decoratePlayers(this.data.room, { selectedPlayerIds: ids });
    } else if (this.data.game.phase === 'ASSASSINATION' && this.data.game.assassin && id !== this.data.room.myPlayerId) {
      this.setData({ assassinationTarget: id, selectedIds: [id] }); this.decoratePlayers(this.data.room, { selectedPlayerIds: [id] });
    }
  },
  run(task) { if (this.data.busy) return Promise.resolve(null); this.setData({ busy: true }); return task().then(result => { if (result && result.gameId) this.setData({ game: result }); return this.refresh(); }).catch(() => null).finally(() => this.setData({ busy: false })); },
  startGame() { this.run(() => api.start(this.data.roomId)); },
  confirmRole() { this.run(() => api.confirmRole(this.data.game.gameId)); },
  submitTeam() { this.run(() => api.submitTeam(this.data.game.gameId, this.data.selectedIds)).then(() => this.setData({ selectedIds: [] })); },
  approve() { this.run(() => api.vote(this.data.game.gameId, 'APPROVE')); },
  reject() { this.run(() => api.vote(this.data.game.gameId, 'REJECT')); },
  missionSuccess() { this.run(() => api.mission(this.data.game.gameId, 'SUCCESS')); },
  missionFail() { this.run(() => api.mission(this.data.game.gameId, 'FAIL')); },
  continueRound() { this.run(() => api.continueRound(this.data.game.gameId)); },
  assassinate() { this.run(() => api.assassinate(this.data.game.gameId, this.data.assassinationTarget)); },
  restart() { this.run(() => api.restart(this.data.game.gameId)).then(() => this.setData({ role: null, selectedIds: [] })); },
  leaveRoom() { api.leaveRoom(this.data.roomId).then(() => wx.reLaunch({ url: '/pages/index/index' })); }
});
