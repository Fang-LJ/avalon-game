const api = require('../../services/avalon');
const auth = require('../../services/auth');
const socket = require('../../utils/socket');
const ui = require('../../utils/presentation');
const { roleCard, CARDS } = require('../../utils/cards');
const PHASES = {
  ROLE_CONFIRM: '身份揭晓',
  TEAM_BUILDING: '队长选人',
  TEAM_VOTING: '组队投票',
  MISSION_EXECUTING: '秘密任务',
  LADY_OF_LAKE: '湖中仙女',
  ASSASSINATION: '刺杀梅林',
  FINISHED: '游戏结束',
};
Page({
  data: {
    roomId: null,
    room: null,
    game: null,
    role: null,
    rule: null,
    displayPlayers: [],
    standingPlayers: [],
    botPlayers: [],
    selectedIds: [],
    selectedText: '',
    targetName: '',
    draftKey: '',
    assassinationTarget: null,
    ladyTarget: null,
    ladyResult: null,
    ladyResultGameId: null,
    missionChoice: '',
    missionOverlayOpen: false,
    missionOverlayKey: '',
    missionSuccessCard: CARDS.actions.SUCCESS,
    missionFailCard: CARDS.actions.FAIL,
    missionCardBack: CARDS.back.ACTION,
    isLeader: false,
    phaseTitle: '',
    busy: false,
    error: '',
    timeline: { missions: [], proposals: [] },
    entries: [],
    finished: null,
    board: false,
    viewVotes: false,
    roleOverlay: false,
    identityRevealedGameId: null,
    roleCardFront: '',
    roleCardBack: CARDS.back.ROLE,
  },
  onLoad(options) {
    this.setData({ roomId: Number(options.roomId) });
  },
  onShow() {
    if (!auth.requireSession()) return;
    this.active = true;
    this.refresh().then(() => {
      if (this.active) this.stopSocket = socket.connect(event => this.handleRoomEvent(event));
    });
    this.poller = setInterval(() => this.refresh(), 5000);
  },
  onHide() {
    this.stop();
  },
  onUnload() {
    this.stop();
  },
  stop() {
    this.active = false;
    if (this.stopSocket) this.stopSocket();
    clearInterval(this.poller);
  },
  handleRoomEvent(event) {
    if (!this.active) return;
    if (event.type === 'ROOM_CLOSED' && event.roomId === this.data.roomId) {
      this.exitClosedRoom();
      return;
    }
    if (event.type === 'REMATCH_CREATED') this.setData({ roomId: event.roomId });
    if (this.refreshing) this.refreshing.finally(() => { if (this.active) this.refresh(); });
    else this.refresh();
  },
  exitClosedRoom() {
    if (!this.active) return;
    this.stop();
    wx.showToast({ title: '房间已关闭', icon: 'none' });
    wx.reLaunch({ url: '/pages/index/index' });
  },
  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },
  refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.fetchState()
      .catch((error) => {
        if (!this.active) return;
        this.setData({ error: '同步失败，点击重试' });
        if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
          wx.reLaunch({ url: '/pages/index/index' });
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  },
  async fetchState() {
    const requestedRoomId = this.data.roomId;
    let room;
    try {
      room = await api.room(requestedRoomId, false);
    } catch (error) {
      if (!this.active || requestedRoomId !== this.data.roomId) return;
      if (error.code !== 'NOT_FOUND') throw error;
      // The client may have missed REMATCH_CREATED while offline. Old test games are deleted.
      room = await api.currentRoom();
      if (!room) {
        this.exitClosedRoom();
        return;
      }
    }
    if (!this.active || requestedRoomId !== this.data.roomId) return;
    if (room.status === 'CLOSED') {
      this.exitClosedRoom();
      return;
    }
    const changed =
      room.currentGameId !== (this.data.game && this.data.game.gameId);
    if (changed)
      this.setData({
        game: null,
        role: null,
        selectedIds: [],
        assassinationTarget: null,
        ladyTarget: null,
        ladyResult: null,
        ladyResultGameId: null,
        missionChoice: '',
        missionOverlayOpen: false,
        missionOverlayKey: '',
        finished: null,
        draftKey: '',
        viewVotes: false,
        roleOverlay: false,
        identityRevealedGameId: null,
        roleCardFront: '',
      });
    this.setData({
      room,
      roomId: room.roomId,
      rule: ui.rules(room.maxPlayers),
      error: '',
    });
    if (!room.currentGameId) {
      this.setData({ phaseTitle: '等待大厅' });
      this.decoratePlayers();
      return;
    }
    const gameId = room.currentGameId;
    const snapshot = await Promise.all([
      api.game(gameId),
      api.timeline(gameId),
      api.myRole(gameId),
    ]).catch(error => {
      if (!this.active || room.roomId !== this.data.roomId) return null;
      throw error;
    });
    if (!snapshot || !this.active || room.roomId !== this.data.roomId) return;
    const [game, timeline, role] = snapshot;
    const key = `${gameId}-${game.missionNo}-${game.proposalNo}-${game.phase}`;
    const newPhase = key !== this.data.draftKey;
    let selectedIds = game.selectedPlayerIds || [];
    if (game.phase === 'TEAM_BUILDING')
      selectedIds = newPhase ? [] : this.data.selectedIds;
    if (game.phase === 'ASSASSINATION')
      selectedIds = newPhase ? [] : this.data.selectedIds;
    if (game.phase === 'LADY_OF_LAKE')
      selectedIds = newPhase ? [] : this.data.selectedIds;
    this.setData({
      game,
      timeline,
      roleCardFront: roleCard(role.roleCode),
      role: {
        ...role,
        initial: role.roleCode.charAt(0),
        visiblePlayers: role.visiblePlayers.map((p) => ({
          ...ui.privateKnowledge(p),
          initial: ui.initial(p.nickname),
        })),
      },
      draftKey: key,
      selectedIds,
      missionChoice: newPhase ? '' : this.data.missionChoice,
      missionOverlayOpen: newPhase ? false : this.data.missionOverlayOpen,
      missionOverlayKey: newPhase ? '' : this.data.missionOverlayKey,
      assassinationTarget: newPhase ? null : this.data.assassinationTarget,
      ladyTarget: newPhase ? null : this.data.ladyTarget,
      viewVotes: newPhase ? false : this.data.viewVotes,
      phaseTitle: PHASES[game.phase],
      isLeader: game.leaderPlayerId === room.myPlayerId,
      entries: ui.logs(timeline, room.players),
    });
    this.decoratePlayers();
    this.syncMissionOverlay();
    if (game.phase === 'FINISHED' && !this.data.finished) {
      if (room.testGame) {
        this.setData({ finished: { reasonText: ui.FINISH[game.finishReason] || game.finishReason, targetName: '' } });
        return;
      }
      const replay = await api.replay(gameId);
      if (this.active && this.data.game && this.data.game.gameId === gameId)
        this.setData({
          finished: {
            ...replay,
            reasonText: ui.FINISH[replay.finishReason] || replay.finishReason,
            targetName: (
              replay.players.find(
                (p) => p.playerId === replay.assassinationTargetPlayerId,
              ) || {}
            ).nickname,
          },
        });
    }
  },
  decoratePlayers() {
    const { room, game, role, selectedIds } = this.data;
    if (!room) return;
    if (!game) {
      this.setData({
        displayPlayers: ui.lobbySeats(room.players, room.maxPlayers),
        standingPlayers: room.players.filter((player) => !player.seated),
        botPlayers: room.players.filter((player) => player.isBot),
        board: false,
      });
      return;
    }
    const privateByPlayer = Object.fromEntries(
      ((role && role.visiblePlayers) || []).map((player) => [
        player.playerId,
        {
          knowledgeType: player.knowledgeType,
          knowledgeHint: player.hint,
        },
      ]),
    );
    const privatePlayers = room.players.map((player) => ({
      ...player,
      ...(privateByPlayer[player.playerId] || {}),
    }));
    const players = ui
      .seats(
        privatePlayers,
        selectedIds,
        game.leaderPlayerId,
        room.maxPlayers,
        game.phase,
      )
      .map((p) => ({
        ...p,
        disabled: !!(
          game &&
          game.phase === 'LADY_OF_LAKE' &&
          game.ladyHolder &&
          !game.ladyEligibleTargetIds.includes(p.playerId)
        ),
      }));
    const selected = players.filter((p) => selectedIds.includes(p.playerId));
    const board = !['ROLE_CONFIRM', 'FINISHED'].includes(game.phase);
    const vote = game && game.latestVoteResult;
    this.setData({
      displayPlayers: players,
      ladyPlayers: players.filter((p) => !p.disabled),
      selectedText: selected.map((p) => p.seatNo).join(' · '),
      targetName: selected.map((p) => p.nickname).join('、'),
      board,
      voteResult: vote
        ? {
            ...vote,
            approveText: vote.votes
              .filter((v) => v.choice === 'APPROVE')
              .map((v) => v.seatNo)
              .join(' '),
            rejectText: vote.votes
              .filter((v) => v.choice === 'REJECT')
              .map((v) => v.seatNo)
              .join(' '),
          }
        : null,
    });
  },
  handleLobbySeat(e) {
    if (this.data.game || this.data.busy) return;
    const detail = e.detail || {};
    if (detail.empty)
      return this.run(() => api.seat(this.data.roomId, Number(detail.seatNo)));
    const room = this.data.room;
    const player = (room.players || []).find(p => p.playerId === Number(detail.playerId));
    if (room.host && player && player.isBot) {
      const roomId = room.roomId;
      wx.showActionSheet({
        itemList: [`移除${player.seatNo}号机器人`],
        success: result => {
          if (result.tapIndex === 0 && this.data.roomId === roomId)
            this.removeBot(player.playerId);
        },
      });
      return;
    }
    if (detail.me)
      wx.showActionSheet({
        itemList: ['起立'],
        success: (result) => {
          if (result.tapIndex === 0)
            this.run(() => api.stand(this.data.roomId));
        },
      });
  },
  togglePlayer(e) {
    const game = this.data.game;
    if (!game || this.data.busy) return;
    const id = Number(e.detail.playerId);
    if (game.phase === 'TEAM_BUILDING' && this.data.isLeader) {
      const ids = this.data.selectedIds.slice(),
        i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else if (ids.length < game.requiredTeamSize) ids.push(id);
      this.setData({ selectedIds: ids });
    } else if (
      game.phase === 'ASSASSINATION' &&
      game.assassin &&
      id !== this.data.room.myPlayerId
    )
      this.setData({ assassinationTarget: id, selectedIds: [id] });
    else if (
      game.phase === 'LADY_OF_LAKE' &&
      game.ladyHolder &&
      game.ladyEligibleTargetIds.includes(id)
    )
      this.setData({ ladyTarget: id, selectedIds: [id] });
    this.decoratePlayers();
  },
  async run(task) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await this.refreshing;
      const result = await task();
      if (result && result.closed) {
        this.exitClosedRoom();
        return;
      }
      if (result && result.roomId) this.setData({ roomId: result.roomId });
      await this.refresh();
    } catch (_) {
      /* request helper presents the error; no optimistic game transition */
    } finally {
      this.setData({ busy: false });
    }
  },
  startGame() {
    return this.run(() => api.start(this.data.roomId));
  },
  addBot() {
    const { room, game, busy } = this.data;
    if (!room || !room.host || game || busy || room.currentPlayers >= room.maxPlayers) return;
    return this.run(() => {
      if (!this.data.game && this.data.roomId === room.roomId) return api.addBot(room.roomId);
    });
  },
  removeBot(playerId) {
    const { room, game, busy } = this.data;
    if (!room || !room.host || game || busy ||
        !room.players.some(p => p.playerId === playerId && p.isBot)) return;
    return this.run(() => {
      const current = this.data.room;
      if (!this.data.game && this.data.roomId === room.roomId && current.host &&
          current.players.some(p => p.playerId === playerId && p.isBot))
        return api.removeBot(room.roomId, playerId);
    });
  },
  endGame() {
    const { room, game, busy } = this.data;
    if (!room || !room.host || busy || (game && game.phase === 'FINISHED')) return;
    const roomId = room.roomId;
    wx.showModal({
      title: game ? '结束当前对局？' : '关闭等待房间？',
      content: room.testGame ? '结束测试局后返回首页，临时游戏数据会清理，不保留记录。' :
        game ? '所有玩家将停止当前流程。本局不计胜负，已产生的记录会保留。' : '关闭后所有玩家返回首页。',
      confirmText: '确认结束',
      success: result => {
        if (!result.confirm) return;
        this.run(async () => {
          // A rematch may have arrived while the confirmation dialog was open.
          if (this.data.roomId !== roomId || !this.data.room.host ||
              (this.data.game && this.data.game.phase === 'FINISHED')) return;
          return api.endGame(roomId);
        });
      },
    });
  },
  identityRevealed(e) {
    if (
      this.data.game && this.data.game.phase === 'ROLE_CONFIRM' &&
      Number(e.detail.gameId) === this.data.game.gameId
    ) this.setData({ identityRevealedGameId: this.data.game.gameId });
  },
  confirmRole(e) {
    const { game, role, identityRevealedGameId, busy } = this.data;
    if (
      !game || game.phase !== 'ROLE_CONFIRM' || !role || role.confirmed || busy ||
      identityRevealedGameId !== game.gameId ||
      !e || Number(e.detail.gameId) !== game.gameId
    ) return;
    const gameId = game.gameId;
    return this.run(() => {
      // run() waits for a pending refresh; a rematch may have changed the game.
      if (
        !this.data.game || this.data.game.gameId !== gameId ||
        this.data.game.phase !== 'ROLE_CONFIRM' || !this.data.role ||
        this.data.role.confirmed
      ) return;
      return api.confirmRole(gameId);
    });
  },
  submitTeam() {
    if (this.data.selectedIds.length !== this.data.game.requiredTeamSize)
      return;
    return this.run(() =>
      api.submitTeam(this.data.game.gameId, this.data.selectedIds),
    );
  },
  approve() {
    return this.run(() => api.vote(this.data.game.gameId, 'APPROVE'));
  },
  reject() {
    return this.run(() => api.vote(this.data.game.gameId, 'REJECT'));
  },
  missionSuccess() {
    if (!this.canChooseMission()) return;
    this.setData({ missionChoice: 'SUCCESS' });
  },
  missionFail() {
    if (this.canChooseMission() && this.data.game.evil)
      this.setData({ missionChoice: 'FAIL' });
  },
  canChooseMission() {
    const { game, busy, viewVotes } = this.data;
    return !!(game && game.phase === 'MISSION_EXECUTING' && game.onMission &&
      !game.hasSubmittedMission && !busy && !viewVotes);
  },
  submitMission() {
    if (!this.canChooseMission() || !this.data.missionChoice) return;
    const { game, missionChoice } = this.data;
    if (missionChoice !== 'SUCCESS' && (missionChoice !== 'FAIL' || !game.evil)) return;
    return this.run(() => {
      const current = this.data.game;
      // A websocket refresh may complete while run() waits. Never submit an old choice to a new round.
      if (current && current.gameId === game.gameId && current.missionNo === game.missionNo &&
          current.proposalNo === game.proposalNo && current.phase === 'MISSION_EXECUTING' &&
          current.onMission && !current.hasSubmittedMission &&
          (missionChoice === 'SUCCESS' || current.evil))
        return api.mission(game.gameId, missionChoice).then(result => {
          const latest = this.data.game;
          if (latest && latest.gameId === game.gameId && latest.missionNo === game.missionNo &&
              latest.proposalNo === game.proposalNo)
            this.setData({ missionOverlayOpen: false, missionChoice: '' });
          return result;
        });
    });
  },
  syncMissionOverlay() {
    const { game, missionOverlayKey } = this.data;
    if (!game || game.phase !== 'MISSION_EXECUTING' || !game.onMission || game.hasSubmittedMission) {
      this.setData({ missionOverlayOpen: false });
      return;
    }
    const key = `${game.gameId}-${game.missionNo}-${game.proposalNo}`;
    if (key !== missionOverlayKey)
      this.setData({ missionOverlayKey: key, missionOverlayOpen: true, roleOverlay: false, viewVotes: false });
  },
  openMissionOverlay() {
    const { game, busy } = this.data;
    if (!game || game.phase !== 'MISSION_EXECUTING' || !game.onMission || game.hasSubmittedMission || busy) return;
    this.setData({
      missionOverlayOpen: true,
      missionOverlayKey: `${game.gameId}-${game.missionNo}-${game.proposalNo}`,
      viewVotes: false,
      roleOverlay: false,
    });
  },
  closeMissionOverlay() {
    if (!this.data.busy) this.setData({ missionOverlayOpen: false });
  },
  toggleVotes() {
    if (this.data.busy) return;
    const viewVotes = !this.data.viewVotes;
    this.setData({ viewVotes, missionOverlayOpen: false });
    if (!viewVotes) this.openMissionOverlay();
    this.decoratePlayers();
  },
  inspectLady() {
    if (!this.data.ladyTarget) return;
    return this.run(async () => {
      const gameId = this.data.game.gameId;
      const result = await api.inspectLady(gameId, this.data.ladyTarget);
      this.setData({ ladyResult: result, ladyResultGameId: gameId });
    });
  },
  dismissLady() {
    this.setData({ ladyResult: null });
  },
  openRoleOverlay() {
    if (this.data.role && !this.data.busy)
      this.setData({ roleOverlay: true, missionOverlayOpen: false });
  },
  closeRoleOverlay() {
    this.setData({ roleOverlay: false });
  },
  ignoreTap() {},
  assassinate() {
    if (!this.data.assassinationTarget || this.data.busy) return;
    const id = this.data.assassinationTarget,
      gameId = this.data.game.gameId;
    wx.showModal({
      title: '确认刺杀',
      content: `确定刺杀「${this.data.targetName}」？提交后不可更改。`,
      confirmText: '确认刺杀',
      success: (r) => {
        if (r.confirm) this.run(() => api.assassinate(gameId, id));
      },
    });
  },
  restart() {
    return this.run(() => api.restart(this.data.game.gameId));
  },
  replay() {
    wx.navigateTo({
      url: `/pages/replay/replay?gameId=${this.data.game.gameId}`,
    });
  },
  copyCode() {
    wx.setClipboardData({ data: this.data.room.roomCode });
  },
  confirmLeaveRoom() {
    if (this.data.busy || !this.data.room) return;
    const roomId = this.data.roomId;
    const gameId = this.data.game && this.data.game.gameId;
    wx.showModal({
      title: '退出当前房间？',
      content: '退出后你将暂时离线，对局仍会继续；如果有待完成的操作，可能影响其他玩家。确认退出吗？',
      confirmText: '确认退出',
      success: result => {
        if (result.confirm && this.data.roomId === roomId &&
            this.data.game && this.data.game.gameId === gameId)
          this.leaveRoom();
      },
    });
  },
  leaveRoom() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    api
      .leaveRoom(this.data.roomId)
      .then(() => {
        this.stop();
        wx.reLaunch({ url: '/pages/index/index' });
      })
      .catch(() => {})
      .finally(() => this.setData({ busy: false }));
  },
});
