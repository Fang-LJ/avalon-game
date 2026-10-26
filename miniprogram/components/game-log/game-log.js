const { CARDS } = require('../../utils/cards');
const { proposalDisplay } = require('../../utils/proposal-display');
const { resultCards } = require('../../utils/mission-result');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    entries: Array, replay: Boolean, compact: Boolean, gameId: Number,
    night: Boolean, maxPlayers: Number, players: { type: Array, value: [] },
    maxMissionSlots: { type: Number, value: 5 },
  },
  data: {
    expanded: false, liveEntries: [], allEntries: [], historyIndex: 0, swiperCurrent: 0,
    currentProposalId: null, historyGameId: null, allHistoryOpen: false,
  },
  lifetimes: {
    detached() { if (this._historyReleaseTimer) clearTimeout(this._historyReleaseTimer); this._pendingHistory = null; },
  },
  observers: {
    'players,night,maxPlayers'() {
      this.refreshHistory(this.data.entries, this.data.gameId, this.data.compact,
        this.data.replay, this.data.maxMissionSlots);
    },
    'entries,gameId,compact,replay,maxMissionSlots'(entries, gameId, compact, replay, maxMissionSlots = 5) {
      this.refreshHistory(entries, gameId, compact, replay, maxMissionSlots);
    },
  },
  methods: {
    refreshHistory(entries, gameId, compact, replay, maxMissionSlots = 5) {
      if (!compact || replay) return;
      const slotCount = [3, 4, 5].includes(maxMissionSlots) ? maxMissionSlots : 5;
      const liveEntries = (entries || []).filter(entry =>
        entry.status === 'APPROVED' || entry.status === 'REJECTED').map((entry, index) => {
          const missionCards = entry.status === 'APPROVED' && entry.resolved !== false ? resultCards(entry.mission).map(card => ({
            index: card.index, src: CARDS.actions[card.type],
          })) : [];
          return {
            ...entry,
            ...proposalDisplay(entry, this.data.players, this.data.maxPlayers),
            pageNo: index + 1,
            missionCards,
            // Legacy guest history keeps its fixed slots; formal cards render only real cards.
            missionSlots: Array.from({ length: slotCount }, (_, index) => missionCards[index] || null),
            missionSlotIndexes: Array.from({ length: slotCount }, (_, index) => index),
            missionSlotCount: slotCount,
          };
        });
      const snapshot = { gameId, liveEntries, signature: JSON.stringify([gameId, liveEntries]) };
      if (snapshot.signature === this._historySignature) {
        this._pendingHistory = null;
        return;
      }
      // Native swiper owns the gesture. Do not change children/current mid-transition.
      if (this.data.historyGameId === gameId && (this._historyTouching || this._historyMoving)) {
        this._pendingHistory = snapshot;
        return;
      }
      this.applyHistory(snapshot);
    },
    applyHistory({ gameId, liveEntries, signature }) {
      const previous = this.data.liveEntries;
      const changedGame = this.data.historyGameId !== gameId;
      const followingLatest = previous.length &&
        this.data.currentProposalId === previous[previous.length - 1].proposalId;
      let index = liveEntries.findIndex(entry => entry.proposalId === this.data.currentProposalId);
      if (changedGame || !previous.length || followingLatest || index < 0)
        index = Math.max(0, liveEntries.length - 1);
      if (changedGame) {
        if (this._historyReleaseTimer) clearTimeout(this._historyReleaseTimer);
        this._historyTouching = this._historyMoving = false;
      }
      this._pendingHistory = null;
      this._historySignature = signature;
      const update = {
        liveEntries, allEntries: liveEntries.slice().reverse(), historyIndex: index,
        currentProposalId: liveEntries[index]?.proposalId ?? null,
        historyGameId: gameId,
        allHistoryOpen: changedGame || !liveEntries.length ? false : this.data.allHistoryOpen,
      };
      // Ordinary result updates must never rewrite native current.
      if (changedGame || index !== this.data.historyIndex) update.swiperCurrent = index;
      this.setData(update);
    },
    historyChange(event) {
      const index = event.detail.current;
      const entry = Number.isInteger(index) && this.data.liveEntries[index];
      if (entry && (index !== this.data.historyIndex || entry.proposalId !== this.data.currentProposalId))
        this.setData({ historyIndex: index, currentProposalId: entry.proposalId });
    },
    historyTouchStart() {
      if (this._historyReleaseTimer) clearTimeout(this._historyReleaseTimer);
      this._historyTouching = true;
    },
    historyTransition(event) {
      if (Math.abs(event.detail.dx || 0) > .5) this._historyMoving = true;
    },
    historyTouchEnd() {
      this._historyTouching = false;
      // A tap/long press may produce no animationfinish. Release its deferred refresh.
      if (this._historyReleaseTimer) clearTimeout(this._historyReleaseTimer);
      this._historyReleaseTimer = setTimeout(() => this.finishHistoryMotion(), 500);
    },
    historyAnimationFinish(event) {
      if (this._historyTouching) return;
      this.historyChange(event);
      this.finishHistoryMotion();
    },
    finishHistoryMotion() {
      if (this._historyReleaseTimer) clearTimeout(this._historyReleaseTimer);
      this._historyMoving = false;
      if (this.data.swiperCurrent !== this.data.historyIndex)
        this.setData({ swiperCurrent: this.data.historyIndex });
      const pending = this._pendingHistory;
      if (pending) this.applyHistory(pending);
    },
    shiftHistory(event) {
      if (this._historyTouching || this._historyMoving) return;
      const index = this.data.historyIndex + Number(event.currentTarget.dataset.step);
      const entry = this.data.liveEntries[index];
      if (!entry) return;
      this._historyMoving = true;
      this.setData({ swiperCurrent: index, historyIndex: index, currentProposalId: entry.proposalId });
      this.historyTouchEnd();
    },
    openAllHistory() {
      if (this.data.compact && !this.data.replay && (this.data.liveEntries.length > 1 || (this.data.night && this.data.liveEntries.length)))
        this.setData({ allHistoryOpen: true });
    },
    closeAllHistory() { this.setData({ allHistoryOpen: false }); },
    ignoreTap() {},
    toggle() {
      this.setData({ expanded: !this.data.expanded });
    },
  },
});
