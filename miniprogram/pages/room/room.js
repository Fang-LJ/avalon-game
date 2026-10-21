const api = require('../../services/avalon');
const auth = require('../../services/auth');
const socket = require('../../utils/socket');
const invite = require('../../utils/invite');
const ui = require('../../utils/presentation');
const deduction = require('../../utils/role-guesses');
const teamDraft = require('../../utils/team-draft');
const { roleCard, CARDS } = require('../../utils/cards');
const { normalizeResult, storageKey } = require('../../utils/mission-result');
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
    teamDraftSupported: false,
    teamNominated: false,
    nominatedPlayerIds: [],
    nominatedText: '',
    teamSyncPending: false,
    teamSyncError: '',
    targetName: '',
    draftKey: '',
    assassinationTarget: null,
    assassinationText: '等待刺客刺杀',
    ladyTarget: null,
    ladyResult: null,
    ladyResultGameId: null,
    missionChoice: '',
    missionOverlayOpen: false,
    missionOverlayKey: '',
    missionResultOpen: false,
    missionResult: null,
    missionResultKey: '',
    acknowledgedMissionResultKey: '',
    missionSuccessCard: CARDS.actions.SUCCESS,
    missionFailCard: CARDS.actions.FAIL,
    missionCardBack: CARDS.back.ACTION,
    isLeader: false,
    canEarlyAssassination: false,
    rejection: { dots: [], forced: false },
    phaseTitle: '',
    lobbyStatus: '',
    lobbyStatusLines: [],
    lobbyLayout: null,
    lobbyRoleText: '',
    busy: false,
    botAdding: false,
    botRemoving: false,
    copiedRoomCode: '',
    error: '',
    timeline: { missions: [], proposals: [] },
    entries: [],
    finished: null,
    finishedIdentities: [],
    finishedGroups: [],
    missionDetail: null,
    board: false,
    viewVotes: false,
    roleOverlay: false,
    identityRevealedGameId: null,
    roleCardFront: '',
    roleCardBack: CARDS.back.ROLE,
    personalGuesses: {},
    roleGuessSheet: null,
    canGuessRoles: false,
  },
  onLoad(options) {
    this.setData({ roomId: Number(options.roomId) });
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ menus: ['shareAppMessage'] });
  },
  onShareAppMessage() {
    const { room, game } = this.data;
    const code = room && invite.validRoomCode(room.roomCode);
    if (room && room.status === 'WAITING' && !game && code)
      return { title: `邀请你加入圆桌秘境 · ${room.maxPlayers} 人局`, path: invite.joinPath(code), imageUrl: '/assets/ui-v3-round2/share-cover.png' };
    return { title: '圆桌秘境 · 阿瓦隆', path: '/pages/index/index', imageUrl: '/assets/ui-v3-round2/share-cover.png' };
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
    this.closeTeamSync();
    this.setData({ roleGuessSheet: null });
    if (this.stopSocket) this.stopSocket();
    clearInterval(this.poller);
  },
  handleRoomEvent(event) {
    if (!this.active) return;
    if (event.type === 'ROOM_CLOSED' && event.roomId === this.data.roomId) {
      this.exitClosedRoom();
      return;
    }
    if (event.type === 'TEAM_DRAFT_UPDATED' && event.roomId === this.data.roomId && this.applyTeamDraft(event.teamDraft)) return;
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
    const epoch = this.stateEpoch || 0;
    this.refreshing = this.fetchState()
      .catch((error) => {
        if (!this.active || epoch !== (this.stateEpoch || 0)) return;
        this.setData({ error: '同步失败，点击重试' });
        if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
          wx.reLaunch({ url: '/pages/index/index' });
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  },
  async refreshAfterMutation() {
    // Wait for the old single-flight request to settle, then fetch again after the POST completed.
    // A socket callback may already have started that fresh request; sharing it is safe.
    const pending = this.refreshing;
    if (pending) { try { await pending; } catch (_) { /* Still request authoritative post-mutation data. */ } }
    return this.refresh();
  },
  async fetchState() {
    const requestedRoomId = this.data.roomId;
    const epoch = this.stateEpoch || 0;
    const currentRead = () => this.active && requestedRoomId === this.data.roomId && epoch === (this.stateEpoch || 0);
    let room;
    try {
      room = await api.room(requestedRoomId, false);
    } catch (error) {
      if (!currentRead()) return;
      if (error.code !== 'NOT_FOUND') throw error;
      // The client may have missed REMATCH_CREATED while offline. Old test games are deleted.
      room = await api.currentRoom();
      if (!room) {
        this.exitClosedRoom();
        return;
      }
    }
    if (!currentRead()) return;
    if (room.status === 'CLOSED') {
      this.exitClosedRoom();
      return;
    }
    const changed =
      room.currentGameId !== (this.data.game && this.data.game.gameId);
    if (changed) {
      this.closeTeamSync();
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
        missionResultOpen: false,
        missionResult: null,
        missionResultKey: '',
        acknowledgedMissionResultKey: '',
        finished: null,
        finishedIdentities: [],
        finishedGroups: [],
        missionDetail: null,
        entries: [],
        draftKey: '',
        viewVotes: false,
        roleOverlay: false,
        identityRevealedGameId: null,
        roleCardFront: '',
        personalGuesses: {},
        roleGuessSheet: null,
        canGuessRoles: false,
      });
    }
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
      api.game(gameId).then(game => {
        // Observe the public phase immediately, without waiting for timeline/my-role.
        if (currentRead() && ['ASSASSINATION', 'FINISHED'].includes(game.phase)) {
          this.clearPrivateGuesses(game.gameId, room.myPlayerId);
          this.decoratePlayers();
        }
        return game;
      }),
      api.timeline(gameId),
      api.myRole(gameId),
    ]).catch(error => {
      if (!this.active || room.roomId !== this.data.roomId || epoch !== (this.stateEpoch || 0)) return null;
      throw error;
    });
    if (!snapshot || !this.active || room.roomId !== this.data.roomId || epoch !== (this.stateEpoch || 0)) return;
    const [game, timeline, role] = snapshot;
    this.setData({
      ...this.gameStateUpdate(game),
      timeline,
      roleCardFront: roleCard(role.roleCode),
      role: {
        ...role,
        initial: role.roleCode.charAt(0),
        visiblePlayers: role.visiblePlayers.map((p) => ({
          ...ui.privateVisiblePlayer(p, role.roleCode),
          initial: ui.initial(p.nickname),
        })),
      },
      entries: ui.liveLogs(timeline, room.players),
    });
    this.decoratePlayers();
    this.syncMissionOverlay();
    if (game.phase === 'FINISHED' && !this.data.finished) {
      if (room.testGame) {
        this.setData({ finished: { reasonText: ui.FINISH[game.finishReason] || game.finishReason, targetName: '' } });
        return;
      }
      const replay = await api.replay(gameId);
      if (this.active && epoch === (this.stateEpoch || 0) && this.data.game && this.data.game.gameId === gameId)
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
  gameStateUpdate(game) {
    if (['ASSASSINATION', 'FINISHED'].includes(game.phase))
      this.clearPrivateGuesses(game.gameId, this.data.room && this.data.room.myPlayerId);
    const team = this.adoptTeamDraft(game);
    const current = this.data.game;
    if (current && current.gameId === game.gameId && current.phase === 'ASSASSINATION' &&
        game.phase === 'ASSASSINATION' && current.assassinationTarget && game.assassinationTarget &&
        current.assassinationTargetRevision > game.assassinationTargetRevision)
      game = { ...game, assassinationTarget: current.assassinationTarget,
        assassinationTargetRevision: current.assassinationTargetRevision };
    const key = `${game.gameId}-${game.missionNo}-${game.proposalNo}-${game.phase}-${game.leaderPlayerId}`;
    const newPhase = key !== this.data.draftKey;
    const selecting = ['TEAM_BUILDING', 'ASSASSINATION', 'LADY_OF_LAKE'].includes(game.phase);
    const target = ui.assassinationTarget(game);
    return {
      game: team.teamDraftSupported ? { ...game, teamDraft: this.teamSync.draft } : game, draftKey: key,
      ...team,
      selectedIds: game.phase === 'ASSASSINATION' ? (target ? [target.playerId] : [])
        : game.phase === 'TEAM_BUILDING' && team.teamDraftSupported ? team.selectedIds
          : selecting ? (newPhase ? [] : this.data.selectedIds) : game.selectedPlayerIds || [],
      phaseTitle: PHASES[game.phase],
      isLeader: game.leaderPlayerId === this.data.room.myPlayerId,
      missionChoice: newPhase ? '' : this.data.missionChoice,
      missionOverlayOpen: newPhase ? false : this.data.missionOverlayOpen,
      missionOverlayKey: newPhase ? '' : this.data.missionOverlayKey,
      assassinationTarget: target ? target.playerId : null,
      assassinationText: ui.assassinationText(game),
      ladyTarget: newPhase ? null : this.data.ladyTarget,
      viewVotes: newPhase ? false : this.data.viewVotes,
      finishedIdentities: game.phase === 'FINISHED' ? ui.finishedIdentities(game.identities) : [],
      finishedGroups: game.phase === 'FINISHED' ? ui.finishedGroups(game.identities, game.winner) : [],
      missionDetail: ['ROLE_CONFIRM', 'FINISHED'].includes(game.phase) ? null : this.data.missionDetail,
      ...(newPhase && game.phase === 'ASSASSINATION'
        ? { roleOverlay: false, ladyResult: null, ladyResultGameId: null, missionDetail: null } : {}),
      // Keep the existing result reveal authoritative and atomic with the advanced server phase.
      ...this.missionResultUpdate(game),
      ...(['ASSASSINATION', 'FINISHED', 'ROLE_CONFIRM'].includes(game.phase)
        ? { personalGuesses: {}, roleGuessSheet: null, canGuessRoles: false } : {}),
    };
  },
  closeTeamSync() {
    if (this.teamSync) this.teamSync.close();
    this.teamSync = null;
  },
  teamSyncUpdate(status) {
    return { teamDraftSupported: true, teamNominated: status.draft.nominated,
      nominatedPlayerIds: status.draft.nominatedPlayerIds, selectedIds: status.selectedIds,
      teamSyncPending: status.pending, teamSyncError: status.error ? '选人同步失败，点击重试' : '' };
  },
  adoptTeamDraft(game) {
    const draft = teamDraft.normalize(game.teamDraft, game);
    if (!draft) {
      this.closeTeamSync();
      return { teamDraftSupported: false, teamNominated: false, nominatedPlayerIds: [], teamSyncPending: false, teamSyncError: '' };
    }
    if (!this.teamSync || teamDraft.scope(this.teamSync.draft) !== teamDraft.scope(draft)) {
      this.closeTeamSync();
      const scope = teamDraft.scope(draft);
      this.teamSync = new teamDraft.DraftSync(draft, request => api.updateTeamDraft(draft.gameId, request), status => {
        const current = this.data.game;
        if (this.active === false || !current || current.phase !== 'TEAM_BUILDING' || teamDraft.scope(current) !== scope) return;
        this.setData({ ...this.teamSyncUpdate(status), game: { ...current, teamDraft: status.draft } });
        this.decoratePlayers();
      }, game.requiredTeamSize);
    } else this.teamSync.accept(draft, false);
    return this.teamSyncUpdate(this.teamSync.status());
  },
  applyTeamDraft(value) {
    const game = this.data.game, draft = game && teamDraft.normalize(value, game);
    if (!draft) return false;
    if (!this.teamSync) this.adoptTeamDraft({ ...game, teamDraft: draft });
    this.teamSync.accept(draft);
    return true;
  },
  async retryTeamDraft() {
    const sync = this.teamSync, game = this.data.game;
    if (!sync || !this.data.isLeader || this.data.busy || game.phase !== 'TEAM_BUILDING') return;
    try {
      const result = await api.game(game.gameId);
      if (this.active === false || sync !== this.teamSync) return;
      const draft = teamDraft.normalize(result.teamDraft, game);
      if (!draft) { await this.refreshAfterMutation(); return; }
      sync.retry(draft);
      await sync.flush();
    } catch (_) { /* Keep the explicit retry state until authority is restored. */ }
  },
  applyGameMutationResult(result, context) {
    const current = this.data.game;
    if (this.active === false || !current || this.data.roomId !== context.roomId ||
        current.gameId !== context.gameId || !result || result.gameId !== context.gameId || !PHASES[result.phase]) return false;
    // Invalidate every GET that began before this confirmed POST response, including late errors.
    this.stateEpoch = (this.stateEpoch || 0) + 1;
    const phases = Object.keys(PHASES);
    const older = current.phase === 'FINISHED' && result.phase !== 'FINISHED' ||
      current.phase === 'ASSASSINATION' && !['ASSASSINATION', 'FINISHED'].includes(result.phase) ||
      result.phase !== 'FINISHED' && (result.missionNo < current.missionNo ||
        result.missionNo === current.missionNo && (result.proposalNo < current.proposalNo ||
          result.proposalNo === current.proposalNo && phases.indexOf(result.phase) < phases.indexOf(current.phase)));
    if (older) return false; // A bot may have advanced the game while the POST response travelled back.
    if (result.phase === current.phase && result.missionNo === current.missionNo && result.proposalNo === current.proposalNo) {
      // Completed actions cannot be undone within the same proposal. Preserve newer observed bot ticks.
      const union = key => [...new Set([...(current[key] || []), ...(result[key] || [])])].sort((a,b) => a-b);
      result = { ...result,
        votedPlayerIds: result.phase === 'TEAM_VOTING' ? union('votedPlayerIds') : result.votedPlayerIds,
        missionSubmittedPlayerIds: result.phase === 'MISSION_EXECUTING' ? union('missionSubmittedPlayerIds') : result.missionSubmittedPlayerIds,
        hasVoted: result.phase === 'TEAM_VOTING' ? current.hasVoted === true || result.hasVoted === true : result.hasVoted,
        hasSubmittedMission: result.phase === 'MISSION_EXECUTING' ? current.hasSubmittedMission === true || result.hasSubmittedMission === true : result.hasSubmittedMission,
      };
    }
    this.setData(this.gameStateUpdate(result));
    this.decoratePlayers();
    this.syncMissionOverlay();
    return true;
  },
  async runGameMutation(task, { waitForCurrent = false } = {}) {
    if (this.data.busy || !this.data.game) return;
    const context = { roomId: this.data.roomId, gameId: this.data.game.gameId };
    this.setData({ busy: true });
    try {
      if (waitForCurrent) await this.refreshing;
      const result = await task();
      if (this.active === false) return;
      this.applyGameMutationResult(result, context);
      await this.refreshAfterMutation();
    } catch (_) {
      /* No completion tick before server success. The request helper reports errors. */
    } finally {
      this.setData({ busy: false });
    }
  },
  missionResultUpdate(game) {
    const result = normalizeResult(game.latestMissionResult);
    if (!result) return {};
    const key = `${game.gameId}-${result.missionNo}`;
    let stored = 0;
    try {
      if (typeof wx.getStorageSync === 'function') stored = wx.getStorageSync(storageKey(game.gameId));
    } catch (_) { /* Storage failure must never stop synchronization. */ }
    const memory = (this.missionResultAcks || {})[game.gameId] || 0;
    const acknowledged = Math.max(Number.isInteger(stored) && stored >= 0 && stored <= 5 ? stored : 0, memory);
    if (result.missionNo <= acknowledged)
      return { acknowledgedMissionResultKey: `${game.gameId}-${acknowledged}` };
    // Keep an already visible reveal stable; a newer result is shown after its confirmation.
    if (this.data.missionResultOpen) return {};
    return {
      missionResultOpen: true, missionResult: result, missionResultKey: key,
      missionOverlayOpen: false, missionChoice: '', roleOverlay: false, viewVotes: false, missionDetail: null,
      acknowledgedMissionResultKey: acknowledged ? `${game.gameId}-${acknowledged}` : '',
    };
  },
  confirmMissionResult(e) {
    const { game, missionResult, missionResultOpen, missionResultKey } = this.data;
    if (!game || !missionResultOpen || !missionResult ||
        missionResultKey !== `${game.gameId}-${missionResult.missionNo}` ||
        !e || !e.detail || e.detail.missionNo !== missionResult.missionNo) return;
    this.missionResultAcks = this.missionResultAcks || {};
    this.missionResultAcks[game.gameId] = Math.max(this.missionResultAcks[game.gameId] || 0, missionResult.missionNo);
    try {
      if (typeof wx.setStorageSync === 'function')
        wx.setStorageSync(storageKey(game.gameId), this.missionResultAcks[game.gameId]);
    } catch (_) { /* Keep in-memory acknowledgment if the device storage is full. */ }
    this.setData({ missionResultOpen: false, acknowledgedMissionResultKey: missionResultKey });
    this.setData(this.missionResultUpdate(game));
    this.syncMissionOverlay();
  },
  decoratePlayers() {
    this.syncRoleGuesses();
    const { room, game, role, selectedIds } = this.data;
    if (!room) return;
    if (!game) {
      const lobbyStatus = ui.lobbyStatus(room);
      this.setData({
        displayPlayers: ui.lobbySeats(room.players, room.maxPlayers, true),
        lobbyLayout: ui.lobbyGeometry(room.maxPlayers),
        lobbyRoleText: ui.rules(room.maxPlayers).evilRoles.replace(/ · /g, ' / '),
        lobbyStatus,
        lobbyStatusLines: lobbyStatus.split(' · '),
        standingPlayers: room.players.filter((player) => !player.seated),
        botPlayers: room.players.filter((player) => player.isBot),
        board: false,
        canEarlyAssassination: false,
        rejection: ui.rejectionState(null),
      });
      return;
    }
    const privateByPlayer = Object.fromEntries(
      (game.phase === 'ASSASSINATION' ? [] : ((role && role.visiblePlayers) || [])).map((player) => [
        player.playerId,
        {
          knowledgeType: !role.roleCode || ui.identityMark(player, role.roleCode).markType ? player.knowledgeType : undefined,
          knowledgeHint: !role.roleCode || ui.identityMark(player, role.roleCode).markType ? player.hint : undefined,
          ...ui.identityMark(player, role.roleCode),
        },
      ]),
    );
    const revealedByPlayer = Object.fromEntries(ui.revealedEvilIdentities(game)
      .map(player => [player.playerId, ui.revealedEvilMark(player)]));
    const privatePlayers = room.players.map((player) => ({
      ...player,
      markType: '', markText: '', markClass: '',
      ...(privateByPlayer[player.playerId] || {}),
      ...(role && player.playerId === room.myPlayerId ? ui.identityMark({}, role.roleCode, true) : {}),
      ...(revealedByPlayer[player.playerId] || {}),
      ...ui.assassinationPlayerState(game, player, room.myPlayerId),
      actionDone: ui.actionDone(game, player),
    })).map(player => ({ ...player,
      ...deduction.displayIdentityMark(player, this.data.personalGuesses[player.playerId], game.phase),
    }));
    const players = ui
      .seats(
        privatePlayers,
        selectedIds,
        game.leaderPlayerId,
        room.maxPlayers,
        game.phase,
        ui.formalGeometry(room.maxPlayers),
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
      circularLayout: ui.formalGeometry(room.maxPlayers),
      ladyPlayers: players.filter((p) => !p.disabled),
      selectedText: selected.map((p) => p.seatNo).join(' · '),
      nominatedText: players.filter(p => (this.data.nominatedPlayerIds || []).includes(p.playerId)).map(p => p.seatNo).join(' · '),
      targetName: selected.map((p) => p.nickname).join('、'),
      board,
      canEarlyAssassination: ui.canStartEarlyAssassination(game, role),
      rejection: ui.rejectionState(game),
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
  roleGuessContext() {
    const { room, role } = this.data;
    return { playerCount: room && room.maxPlayers, viewerPlayerId: room && room.myPlayerId,
      viewerRole: role && role.roleCode, players: (room && room.players) || [],
      visiblePlayers: (role && role.visiblePlayers) || [] };
  },
  clearPrivateGuesses(gameId, myPlayerId) {
    const key = deduction.storageKey(gameId, myPlayerId);
    if (key) {
      this.clearedGuessScopes = this.clearedGuessScopes || new Set();
      this.clearedGuessScopes.add(key);
      deduction.removeGuesses(key, wx);
    }
    this.setData({ personalGuesses: {}, roleGuessSheet: null, canGuessRoles: false });
  },
  syncRoleGuesses() {
    const { game, room, role } = this.data;
    const key = game && room && deduction.storageKey(game.gameId, room.myPlayerId);
    if (game && ['ASSASSINATION', 'FINISHED'].includes(game.phase)) {
      this.clearPrivateGuesses(game.gameId, room && room.myPlayerId);
      return;
    }
    if (!key || !role || !deduction.allowedPhase(game.phase) || this.clearedGuessScopes && this.clearedGuessScopes.has(key)) {
      this.roleGuessScope = '';
      this.setData({ personalGuesses: {}, roleGuessSheet: null, canGuessRoles: false });
      return;
    }
    const c = this.roleGuessContext();
    let guesses = this.data.personalGuesses;
    if (key !== this.roleGuessScope) {
      guesses = deduction.loadGuesses(key, c, wx);
      this.roleGuessScope = key;
      this.setData({ roleGuessSheet: null });
    }
    const clean = deduction.sanitizeGuesses(c, guesses);
    this.setData({ personalGuesses: clean, canGuessRoles: true });
    const sheet = this.data.roleGuessSheet;
    if (sheet) this.setData({ roleGuessSheet: this.buildRoleGuessSheet(sheet.playerId, sheet.scope) });
  },
  buildRoleGuessSheet(playerId, scope) {
    if (!this.data.canGuessRoles) return null;
    const c = this.roleGuessContext(), options = deduction.candidateOptions(
      deduction.markCandidates(c, playerId, this.data.personalGuesses));
    const player = c.players.find(p => p.playerId === playerId);
    if (!player || !options.length) return null;
    const currentRole = this.data.personalGuesses[playerId] || '';
    return { scope, playerId, currentRole, options };
  },
  openRoleGuess(e) {
    const { game, busy, missionResultOpen, missionOverlayOpen, roleOverlay, missionDetail, ladyResult } = this.data;
    if (this.active === false || !game || !deduction.allowedPhase(game.phase) || busy ||
        missionResultOpen || missionOverlayOpen || roleOverlay || missionDetail || ladyResult) return;
    this.syncRoleGuesses();
    const playerId = Number(e && e.detail && e.detail.playerId);
    const c = this.roleGuessContext();
    if (!this.data.canGuessRoles || deduction.knowledge(c, playerId).exactRole) return;
    this.roleGuessSequence = (this.roleGuessSequence || 0) + 1;
    const sheet = this.buildRoleGuessSheet(playerId, `${this.roleGuessScope}:${this.roleGuessSequence}`);
    if (!sheet) {
      if (typeof wx.showToast === 'function') wx.showToast({ title: '当前没有可用身份判断', icon: 'none' });
      return;
    }
    this.setData({ roleGuessSheet: sheet });
  },
  editRoleGuess(e, clear = false) {
    const { game, room, busy, roleGuessSheet: sheet } = this.data, detail = e && e.detail;
    if (this.active === false || !game || !room || busy || !deduction.allowedPhase(game.phase) ||
        !this.data.canGuessRoles || !sheet || !detail || detail.scope !== sheet.scope || detail.playerId !== sheet.playerId ||
        deduction.storageKey(game.gameId, room.myPlayerId) !== this.roleGuessScope) return;
    const c = this.roleGuessContext();
    if (deduction.knowledge(c, sheet.playerId).exactRole ||
        !clear && !deduction.markCandidates(c, sheet.playerId, this.data.personalGuesses).includes(detail.roleCode)) return;
    const cancel = clear || this.data.personalGuesses[sheet.playerId] === detail.roleCode;
    const next = cancel ? deduction.clearGuess(c, this.data.personalGuesses, sheet.playerId)
      : deduction.applyGuess(c, this.data.personalGuesses, sheet.playerId, detail.roleCode);
    if (!deduction.saveGuesses(this.roleGuessScope, next, wx)) {
      if (typeof wx.showToast === 'function') wx.showToast({ title: '个人推测无法保存，请重试', icon: 'none' });
      return;
    }
    this.setData({ personalGuesses: next, roleGuessSheet: null });
    this.decoratePlayers();
  },
  chooseRoleGuess(e) { this.editRoleGuess(e); },
  clearRoleGuess(e) { this.editRoleGuess(e, true); },
  closeRoleGuess(e) {
    const sheet = this.data.roleGuessSheet;
    if (!e || sheet && e.detail && e.detail.scope === sheet.scope) this.setData({ roleGuessSheet: null });
  },
  handleLobbySeat(e) {
    if (this.data.game || this.data.busy || this.data.botAdding || this.data.botRemoving) return;
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
            this.standUp();
        },
      });
  },
  standUp() {
    const { room, game, busy, botAdding } = this.data;
    if (!room || game || busy || botAdding || this.data.botRemoving || room.status !== 'WAITING' || room.mySeatNo == null) return;
    const roomId = room.roomId;
    return this.run(() => {
      const current = this.data.room;
      if (this.active !== false && this.data.roomId === roomId && !this.data.game &&
          current && current.status === 'WAITING' && current.mySeatNo != null)
        return api.stand(roomId);
    });
  },
  togglePlayer(e) {
    const game = this.data.game;
    if (this.active === false || !game || this.data.busy || this.data.missionResultOpen) return;
    const id = Number(e.detail.playerId);
    if (game.phase === 'TEAM_BUILDING' && this.data.isLeader) {
      if (!(this.data.room.players || []).some(p => p.playerId === id)) return;
      const ids = this.data.selectedIds.slice(),
        i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else if (ids.length < game.requiredTeamSize) ids.push(id);
      else {
        ids.shift();
        ids.push(id);
      }
      this.setData({ selectedIds: ids });
      if (this.teamSync) this.teamSync.select(ids);
    } else if (
      game.phase === 'ASSASSINATION' &&
      game.assassin &&
      id !== this.data.room.myPlayerId &&
      !ui.isRevealedEvil(game, id)
    )
      return this.runGameMutation(() => api.selectAssassinationTarget(game.gameId, id));
    else if (
      game.phase === 'LADY_OF_LAKE' &&
      game.ladyHolder &&
      game.ladyEligibleTargetIds.includes(id)
    )
      this.setData({ ladyTarget: id, selectedIds: [id] });
    this.decoratePlayers();
  },
  async run(task) {
    if (this.data.busy || this.data.botAdding || this.data.botRemoving) return;
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
    return this.run(() => {
      const { room, game } = this.data;
      if (this.active !== false && room && room.host && !game && room.status === 'WAITING' &&
          room.canStart && room.currentPlayers >= room.maxPlayers) return api.start(this.data.roomId);
    });
  },
  requestEarlyAssassination() {
    const { game, role, roomId, busy } = this.data;
    if (busy || this.earlyAssassinationDialog || !ui.canStartEarlyAssassination(game, role)) return;
    this.earlyAssassinationDialog = true;
    let handled = false;
    wx.showModal({
      title: '发动提前刺杀？',
      content: '所有邪恶玩家的具体身份将向全员公开。发动后不可撤销，不能回到任务阶段。刺中梅林：邪恶获胜；刺杀失败：正义获胜。',
      confirmText: '发动刺杀', confirmColor: '#c95d68',
      success: result => {
        if (handled) return;
        handled = true;
        this.earlyAssassinationDialog = false;
        if (!result.confirm || this.data.roomId !== roomId || !this.data.game ||
            this.data.game.gameId !== game.gameId || !ui.canStartEarlyAssassination(this.data.game, this.data.role)) return;
        this.runGameMutation(() => {
          // Pending GET / socket updates can invalidate a confirmation before its POST.
          if (this.data.roomId === roomId && this.data.game && this.data.game.gameId === game.gameId &&
              ui.canStartEarlyAssassination(this.data.game, this.data.role)) return api.startAssassination(game.gameId);
        }, { waitForCurrent: true });
      },
      fail: () => { this.earlyAssassinationDialog = false; },
    });
  },
  async runLobbyBotMutation(task, adding) {
    const { room, game, busy, botAdding, botRemoving } = this.data;
    if (this.active === false || !room || !room.host || game || busy || botAdding || botRemoving ||
        room.status !== 'WAITING') return;
    const roomId = room.roomId, epoch = this.stateEpoch || 0;
    const current = () => this.active !== false && this.data.roomId === roomId &&
      (this.stateEpoch || 0) === epoch;
    // Bot requests lock other mutations without toggling their visible loading state.
    this.setData({ botAdding: adding, botRemoving: !adding });
    try {
      await this.refreshing;
      const latest = this.data.room;
      if (!current() || this.data.game || !latest || !latest.host || latest.status !== 'WAITING') return;
      const request = task(latest, roomId);
      if (!request) return;
      await request;
      // Do not reuse a poll/socket GET that started before the mutation completed.
      if (current()) await this.refreshAfterMutation();
    } catch (_) {
      /* Request helper reports failures; keep the roster authoritative and allow retry. */
    } finally {
      this.setData({ botAdding: false, botRemoving: false });
    }
  },
  addBot() {
    const { room } = this.data;
    if (!room || room.currentPlayers >= room.maxPlayers) return;
    return this.runLobbyBotMutation((current, roomId) => {
      if (current.currentPlayers < current.maxPlayers) return api.addBot(roomId);
    }, true);
  },
  removeBot(playerId) {
    const { room } = this.data;
    if (!room || !room.players.some(p => p.playerId === playerId && p.isBot)) return;
    return this.runLobbyBotMutation((current, roomId) => {
      if (current.players.some(p => p.playerId === playerId && p.isBot))
        return api.removeBot(roomId, playerId);
    }, false);
  },
  endGame() {
    const { room, game, busy } = this.data;
    if (!room || !room.host || busy || this.data.botAdding || this.data.botRemoving || (game && game.phase === 'FINISHED')) return;
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
  teamActionAllowed() {
    const { game, isLeader, busy, selectedIds, missionResultOpen, teamSyncError } = this.data;
    if (this.active === false || !game || game.phase !== 'TEAM_BUILDING' || !isLeader || busy || missionResultOpen || teamSyncError) return false;
    if (selectedIds.length !== game.requiredTeamSize) {
      wx.showToast({ title: `请选择 ${game.requiredTeamSize} 名任务成员`, icon: 'none' }); return false;
    }
    return true;
  },
  submitTeam() {
    if (!this.teamActionAllowed()) return;
    // Legacy DTOs keep the released direct-dispatch API, with no nomination request.
    if (!this.teamSync) return this.run(() => api.submitTeam(this.data.game.gameId, this.data.selectedIds));
    return this.dispatchTeam(false);
  },
  nominateTeam() {
    if (!this.teamActionAllowed() || !this.teamSync || this.data.teamNominated) return;
    return this.dispatchTeam(true);
  },
  dispatchTeam(nominate) {
    const sync = this.teamSync;
    if (this.active === false || !sync) return;
    return this.runGameMutation(async () => {
      const draft = await sync.flush();
      const game = this.data.game;
      if (sync !== this.teamSync || !game || game.phase !== 'TEAM_BUILDING' || teamDraft.scope(game) !== teamDraft.scope(draft)) return;
      if (nominate) {
        const result = await api.nominateTeam(game.gameId, teamDraft.requestFor(draft));
        if (this.active !== false && sync === this.teamSync) this.applyTeamDraft(result);
        return; // Nomination remains TEAM_BUILDING and never generates a formal proposal.
      }
      return api.submitTeam(game.gameId, draft.selectedPlayerIds, { missionNo:draft.missionNo,
        proposalNo:draft.proposalNo, leaderPlayerId:draft.leaderPlayerId, expectedDraftRevision:draft.revision });
    }, { waitForCurrent: true });
  },
  approve() {
    return this.vote('APPROVE');
  },
  reject() {
    return this.vote('REJECT');
  },
  vote(choice) {
    const game = this.data.game;
    if (!game || game.phase !== 'TEAM_VOTING' || game.hasVoted || this.data.missionResultOpen) return;
    return this.runGameMutation(() => api.vote(game.gameId, choice));
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
    const { game, busy, viewVotes, missionResultOpen } = this.data;
    return !!(game && game.phase === 'MISSION_EXECUTING' && game.onMission &&
      !game.hasSubmittedMission && !busy && !viewVotes && !missionResultOpen);
  },
  submitMission() {
    if (!this.canChooseMission() || !this.data.missionChoice) return;
    const { game, missionChoice } = this.data;
    if (missionChoice !== 'SUCCESS' && (missionChoice !== 'FAIL' || !game.evil)) return;
    return this.runGameMutation(() => {
      const current = this.data.game;
      // A websocket refresh may complete while the mutation runner waits. Never submit an old choice to a new round.
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
    }, { waitForCurrent: true });
  },
  syncMissionOverlay() {
    const { game, missionOverlayKey } = this.data;
    if (this.data.missionResultOpen || !game || game.phase !== 'MISSION_EXECUTING' || !game.onMission || game.hasSubmittedMission) {
      this.setData({ missionOverlayOpen: false });
      return;
    }
    const key = `${game.gameId}-${game.missionNo}-${game.proposalNo}`;
    if (key !== missionOverlayKey)
      this.setData({ missionOverlayKey: key, missionOverlayOpen: true, roleOverlay: false, viewVotes: false });
  },
  openMissionOverlay() {
    const { game, busy } = this.data;
    if (this.data.missionResultOpen || !game || game.phase !== 'MISSION_EXECUTING' || !game.onMission || game.hasSubmittedMission || busy) return;
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
    if (this.data.busy || this.data.missionResultOpen) return;
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
    if (this.data.role && !this.data.busy && !this.data.missionResultOpen)
      this.setData({ roleOverlay: true, missionOverlayOpen: false, missionDetail: null });
  },
  openMissionDetail(event) {
    const { game, room, timeline, missionResultOpen } = this.data;
    if (!game || !room || missionResultOpen ||
      !['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','LADY_OF_LAKE','ASSASSINATION'].includes(game.phase)) return;
    const detail = ui.missionDetail(timeline, room.players, Number(event.detail.missionNo));
    if (!detail) {
      wx.showToast({ title: '任务记录暂不可用', icon: 'none' });
      return;
    }
    this.setData({ missionDetail: detail, roleOverlay: false, missionOverlayOpen: false });
  },
  closeMissionDetail() { this.setData({ missionDetail: null }); },
  closeRoleOverlay() {
    this.setData({ roleOverlay: false });
  },
  ignoreTap() {},
  assassinate() {
    const game = this.data.game;
    if (!game || game.phase !== 'ASSASSINATION' || !game.assassin ||
        !this.data.assassinationTarget || this.data.busy ||
        ui.isRevealedEvil(game, this.data.assassinationTarget)) return;
    const id = this.data.assassinationTarget,
      gameId = this.data.game.gameId;
    wx.showModal({
      title: '确认刺杀',
      content: `确定刺杀「${this.data.targetName}」？提交后不可更改。`,
      confirmText: '确认刺杀',
      success: (r) => {
        if (r.confirm) this.run(() => {
          const current = this.data.game;
          if (current && current.gameId === gameId && current.phase === 'ASSASSINATION' &&
              current.assassin && this.data.assassinationTarget === id && !ui.isRevealedEvil(current, id)) return api.assassinate(gameId, id);
        });
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
    const { room, roomId } = this.data;
    if (!room || !room.roomCode) return;
    const roomCode = room.roomCode;
    wx.setClipboardData({
      data: String(roomCode),
      success: () => {
        // Preserve WeChat's copied toast and ignore a callback from an old room.
        if (this.active !== false && this.data.roomId === roomId && this.data.room &&
            this.data.room.roomCode === roomCode)
          this.setData({ copiedRoomCode: roomCode });
      },
    });
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
    if (this.data.busy || this.data.botAdding || this.data.botRemoving) return;
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
