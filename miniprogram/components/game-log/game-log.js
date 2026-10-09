const { CARDS } = require('../../utils/cards');
const { resultCards } = require('../../utils/mission-result');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    entries: Array, replay: Boolean, compact: Boolean, gameId: Number,
    maxMissionSlots: { type: Number, value: 5 },
  },
  data: {
    expanded: false, liveEntries: [], allEntries: [], historyIndex: 0,
    currentProposalId: null, historyGameId: null, allHistoryOpen: false,
  },
  observers: {
    'entries,gameId,compact,replay,maxMissionSlots'(entries, gameId, compact, replay, maxMissionSlots = 5) {
      if (!compact || replay) return;
      const slotCount = [3, 4, 5].includes(maxMissionSlots) ? maxMissionSlots : 5;
      const liveEntries = (entries || []).filter(entry =>
        entry.status === 'APPROVED' || entry.status === 'REJECTED').map(entry => {
          const missionCards = entry.status === 'APPROVED' ? resultCards(entry.mission).map(card => ({
            index: card.index, src: CARDS.actions[card.type],
          })) : [];
          return {
            ...entry,
            missionCards,
            missionSlots: Array.from({ length: slotCount }, (_, index) => missionCards[index] || null),
            // Empty slots are null; use numeric keys so multiple empty cells retain stable identity.
            missionSlotIndexes: Array.from({ length: slotCount }, (_, index) => index),
            missionSlotCount: slotCount,
          };
        });
      const previous = this.data.liveEntries;
      const changedGame = this.data.historyGameId !== gameId;
      const followingLatest = previous.length &&
        this.data.currentProposalId === previous[previous.length - 1].proposalId;
      let index = liveEntries.findIndex(entry => entry.proposalId === this.data.currentProposalId);
      if (changedGame || !previous.length || followingLatest || index < 0)
        index = Math.max(0, liveEntries.length - 1);
      this.setData({
        liveEntries,
        allEntries: liveEntries.slice().reverse(),
        historyIndex: index,
        currentProposalId: liveEntries[index]?.proposalId ?? null,
        historyGameId: gameId,
        allHistoryOpen: changedGame || !liveEntries.length ? false : this.data.allHistoryOpen,
      });
    },
  },
  methods: {
    historyChange(event) {
      const index = event.detail.current;
      const entry = this.data.liveEntries[index];
      if (entry) this.setData({ historyIndex: index, currentProposalId: entry.proposalId });
    },
    openAllHistory() {
      if (this.data.compact && !this.data.replay && this.data.liveEntries.length > 1)
        this.setData({ allHistoryOpen: true });
    },
    closeAllHistory() { this.setData({ allHistoryOpen: false }); },
    ignoreTap() {},
    toggle() {
      this.setData({ expanded: !this.data.expanded });
    },
  },
});
