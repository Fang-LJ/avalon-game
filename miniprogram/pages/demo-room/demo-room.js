const { createGame } = require('../../utils/demo-game-engine');
const { chooseAction } = require('../../utils/demo-bot-strategy');
const { backToLogin } = require('../../utils/guest-content');
const ui = require('../../utils/presentation');
const { CARDS, roleCard } = require('../../utils/cards');
const PHASE_NAMES = { ROLE_CONFIRM: '确认身份', TEAM_BUILDING: '队长选人', TEAM_VOTING: '组队表决',
  MISSION_EXECUTING: '秘密任务', ASSASSINATION: '刺杀梅林', FINISHED: '体验结束' };
Page({
  data: { room: null, game: null, role: null, displayPlayers: [], selectedIds: [], entries: [], missions: [],
    rule: ui.rules(5), phaseTitle: '准备体验', hint: '', error: '', isLeader: false, selectedText: '',
    missionChoice: '', missionOverlayOpen: false, missionResultOpen: false, missionResult: null,
    roleOverlay: false, targetId: null, targetName: '', finishedGroups: [], reasonText: '',
    roleCardFront: '', roleCardBack: CARDS.back.ROLE, cards: CARDS, viewVotes: false, rejection: { dots: [] } },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    this.setData({ exitTop: (info.statusBarHeight || 20) + 6 });
    this.engine = createGame(); this.resultAck = 0; this.epoch = 0; this.syncView(); },
  onShow() { if (this.engine) { this.active = true; this.syncView(); } },
  onHide() { this.pause(); },
  onUnload() { this.pause(); if (this.engine) this.engine.dispose(); this.engine = null; },
  pause() { this.active = false; this.cancelBot(); },
  cancelBot() { this.epoch = (this.epoch || 0) + 1; clearTimeout(this.botTimer); this.botTimer = null; },
  syncView() {
    if (!this.engine || this.engine.isDisposed()) return;
    this.cancelBot();
    const { revision, room, game, role, timeline } = this.engine.getView();
    const key = game ? `${game.gameId}:${game.phase}:${game.missionNo}:${game.proposalNo}` : 'waiting';
    const changed = key !== this.stageKey; this.stageKey = key;
    const result = game && game.latestMissionResult;
    const missionResultOpen = !!(result && result.missionNo > this.resultAck);
    const selectedIds = game && game.phase === 'TEAM_BUILDING'
      ? (changed ? [] : this.data.selectedIds) : game && game.phase === 'ASSASSINATION'
        ? (changed ? [] : this.data.selectedIds) : game ? game.selectedPlayerIds : [];
    const isLeader = !!game && game.leaderPlayerId === 1;
    const visible = Object.fromEntries((role ? role.visiblePlayers : []).map(p => [p.playerId, p]));
    const revealed = Object.fromEntries((game ? game.revealedEvilIdentities : []).map(p => [p.playerId, p]));
    const decorated = room.players.map(p => ({ ...p,
      ...ui.identityMark(visible[p.playerId] || {}, role && role.roleCode, p.me),
      ...(revealed[p.playerId] ? ui.revealedEvilMark(revealed[p.playerId]) : {}),
      revealedEvil: !!revealed[p.playerId], actionDone: ui.actionDone(game, p),
      unselectable: !!game && (game.phase === 'ASSASSINATION'
        ? !game.assassin || !!revealed[p.playerId] : game.phase !== 'TEAM_BUILDING' || !isLeader),
    }));
    const displayPlayers = game ? ui.seats(decorated, selectedIds, game.leaderPlayerId, 5, game.phase) : ui.lobbySeats(room.players, 5);
    const projectedRole = role ? { ...role, visiblePlayers: role.visiblePlayers.map(p => ui.privateVisiblePlayer(p, role.roleCode)) } : null;
    let hint = '添加机器人，满五人后开始。无需登录，也不会保存战绩。';
    if (game) {
      hint = { ROLE_CONFIRM: '点击卡牌查看身份，并确认。', TEAM_BUILDING: isLeader ? `选择 ${game.requiredTeamSize} 名玩家执行任务。` : '机器人队长正在选择队伍…',
        TEAM_VOTING: game.hasVoted ? '已投票，等待其他玩家…' : '请对这支队伍投赞成或反对票。',
        MISSION_EXECUTING: game.onMission && !game.hasSubmittedMission ? '你在任务队伍中，请秘密提交任务牌。' : '机器人正在秘密执行任务…',
        ASSASSINATION: game.assassin ? '选择一名正义玩家，确认刺杀。' : '机器人刺客正在选择目标…', FINISHED: '身份已公开，查看本局结果。' }[game.phase];
    }
    this.setData({ revision, room, game, role: projectedRole, displayPlayers, isLeader, hint, selectedIds,
      phaseTitle: game ? PHASE_NAMES[game.phase] : '准备体验', selectedText: selectedIds.map(id => `${id}号`).join(' · '),
      entries: ui.liveLogs(timeline, room.players), missions: timeline.missions, missionResult: result, missionResultOpen,
      roleCardFront: role ? roleCard(role.roleCode) : '', rejection: ui.rejectionState(game),
      finishedGroups: game && game.phase === 'FINISHED' ? ui.finishedGroups(game.identities, game.winner) : [],
      reasonText: game ? ui.FINISH[game.finishReason] || '' : '',
      ...(changed ? { missionChoice: '', missionOverlayOpen: false, targetId: null, targetName: '', roleOverlay: false, viewVotes: false } : {}),
      ...(missionResultOpen ? { missionOverlayOpen: false, roleOverlay: false } : {}),
    });
    this.scheduleBot();
  },
  scheduleBot() {
    if (!this.active || !this.engine || this.data.missionResultOpen || this.confirmingExit || this.botTimer) return;
    const turn = this.engine.botTurn(); if (!turn) return;
    const engine = this.engine, epoch = this.epoch;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (!this.active || this.confirmingExit || engine !== this.engine || epoch !== this.epoch || engine.isDisposed()) return;
      try { engine.dispatch(chooseAction(turn), turn.revision); this.syncView(); }
      catch (e) { this.setData({ error: e.message }); }
    }, 550);
  },
  act(action) {
    if (!this.active || !this.engine || this.confirmingExit || this.data.missionResultOpen) return;
    try { this.engine.dispatch({ ...action, actorId: 1 }, this.data.revision); this.setData({ error: '' }); this.syncView(); }
    catch (e) { this.setData({ error: e.message }); }
  },
  addBot() { this.act({ type: 'ADD_BOT' }); },
  fillBots() { this.act({ type: 'ADD_BOT', count: 5 - this.data.room.currentPlayers }); },
  start() { this.act({ type: 'START' }); },
  confirmRole(e) { if (this.data.game && e.detail.gameId === this.data.game.gameId) this.act({ type: 'CONFIRM' }); },
  selectSeat(e) {
    const game = this.data.game, id = e.detail.playerId;
    if (!this.active || this.data.missionResultOpen || !game || !this.data.room.players.some(p => p.playerId === id)) return;
    if (game.phase === 'TEAM_BUILDING' && this.data.isLeader) {
      const selected = this.data.selectedIds;
      if (!selected.includes(id) && selected.length >= game.requiredTeamSize) return;
      this.setData({ selectedIds: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] }); this.syncView();
    } else if (game.phase === 'ASSASSINATION' && game.assassin && !game.revealedEvilIdentities.some(p => p.playerId === id)) {
      this.setData({ selectedIds: [id], targetId: id, targetName: this.data.room.players.find(p => p.playerId === id).nickname }); this.syncView();
    }
  },
  submitTeam() { this.act({ type: 'TEAM', team: this.data.selectedIds }); },
  approve() { this.act({ type: 'VOTE', choice: 'APPROVE' }); },
  reject() { this.act({ type: 'VOTE', choice: 'REJECT' }); },
  openMission() {
    const g = this.data.game;
    if (g && g.phase === 'MISSION_EXECUTING' && g.onMission && !g.hasSubmittedMission && !this.data.missionResultOpen)
      this.setData({ missionOverlayOpen: true, viewVotes: false });
  },
  closeMission() { this.setData({ missionOverlayOpen: false }); },
  missionSuccess() { this.setData({ missionChoice: 'SUCCESS' }); },
  missionFail() { if (this.data.game && this.data.game.evil) this.setData({ missionChoice: 'FAIL' }); },
  submitMission() { this.act({ type: 'MISSION', choice: this.data.missionChoice }); this.setData({ missionOverlayOpen: false }); },
  confirmResult(e) {
    const result = this.data.missionResult;
    if (!this.active || !this.data.missionResultOpen || !result || e.detail.missionNo !== result.missionNo) return;
    this.resultAck = result.missionNo; this.syncView();
  },
  toggleVotes() { this.setData({ viewVotes: !this.data.viewVotes, missionOverlayOpen: false }); },
  openRole() { if (this.data.role && !this.data.missionResultOpen) this.setData({ roleOverlay: true }); },
  closeRole() { this.setData({ roleOverlay: false }); },
  ignoreTap() {},
  assassinate() { this.act({ type: 'ASSASSINATE', targetId: this.data.targetId }); },
  earlyAssassination() { this.confirmAction('提前刺杀', '立即进入刺杀阶段。刺错会让正义获胜，是否继续？', () => this.act({ type: 'EARLY_ASSASSINATION' })); },
  confirmAction(title, content, callback) {
    if (this.confirmingExit || !this.engine) return;
    this.confirmingExit = true; this.cancelBot();
    const engine = this.engine;
    wx.showModal({ title, content, success: result => {
      if (engine !== this.engine) return;
      this.confirmingExit = false;
      if (!this.active) return;
      if (result.confirm) callback();
      if (this.engine) this.syncView();
    }, fail: () => { this.confirmingExit = false; if (this.active) this.syncView(); } });
  },
  end() { this.confirmAction('结束体验', '结束本局并公开身份，不计胜负或正式战绩。', () => this.act({ type: 'END' })); },
  restart() {
    const reset = () => {
      this.cancelBot(); this.engine.dispose(); this.engine = createGame(); this.resultAck = 0; this.stageKey = null;
      this.engine.dispatch({ type: 'ADD_BOT', actorId: 1, count: 4 }); this.engine.dispatch({ type: 'START', actorId: 1 });
      this.setData({ error: '' }); this.syncView();
    };
    if (this.data.game && this.data.game.phase === 'FINISHED') reset();
    else this.confirmAction('重新开始', '清除本局并重新随机分配五个身份。', reset);
  },
  exit() { this.confirmAction('退出体验', '本地体验进度会清除，是否退出？', () => { this.pause(); this.engine.dispose(); this.engine = null; backToLogin(); }); },
});
