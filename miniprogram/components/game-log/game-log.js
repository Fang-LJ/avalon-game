Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { entries: Array, replay: Boolean, compact: Boolean, gameId: Number },
  data: {
    expanded: false, liveEntries: [], allEntries: [], historyIndex: 0,
    currentProposalId: null, historyGameId: null, allHistoryOpen: false,
  },
  observers: {
    'entries,gameId,compact,replay'(entries, gameId, compact, replay) {
      if (!compact || replay) return;
      const liveEntries = (entries || []).filter(entry =>
        entry.status === 'APPROVED' || entry.status === 'REJECTED');
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
