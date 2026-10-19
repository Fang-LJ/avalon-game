const api = require('../../services/avalon');
const auth = require('../../services/auth');
const { historyCard } = require('../../utils/history-presentation');
Page({
  data: {
    stats: null,
    items: [],
    page: 0,
    total: 0,
    alignment: '',
    loading: false,
    error: '',
    recordWinPercent: 0,
    recordLossPercent: 0,
    filters: [
      { key: 'GOOD', tone: 'good', label: '正义' },
      { key: 'EVIL', tone: 'evil', label: '邪恶' },
    ],
  },
  onShow() {
    if (!auth.requireSession()) return;
    this.load(true);
  },
  onUnload() {
    // Invalidate callbacks from a page that has already left the stack.
    this._historyRequest = (this._historyRequest || 0) + 1;
  },
  async load(reset = false) {
    if (this.data.loading && !reset) return;
    const request = this._historyRequest = (this._historyRequest || 0) + 1;
    const alignment = this.data.alignment;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      loading: true, error: '',
      ...(reset ? { items: [], page: 0, total: 0 } : {}),
    });
    try {
      const [result, stats] = await Promise.all([
        api.history(page, 10, alignment),
        api.stats(),
      ]);
      if (request !== this._historyRequest) return;
      this.setData({
        stats,
        recordWinPercent: stats.wins + stats.losses > 0 ? stats.wins * 100 / (stats.wins + stats.losses) : 0,
        recordLossPercent: stats.wins + stats.losses > 0 ? stats.losses * 100 / (stats.wins + stats.losses) : 0,
        items: (reset ? [] : this.data.items).concat(
          result.items.map(historyCard),
        ),
        total: result.total,
        page,
      });
    } catch (_) {
      if (request === this._historyRequest)
        this.setData({ error: '战绩加载失败，请重试' });
    } finally {
      if (request === this._historyRequest) this.setData({ loading: false });
    }
  },
  filter(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== 'GOOD' && key !== 'EVIL') return;
    this.setData({
      alignment: this.data.alignment === key ? '' : key,
    });
    return this.load(true);
  },
  more() {
    if (!this.data.loading && this.data.items.length < this.data.total)
      this.load();
  },
  retry() {
    this.load(this.data.page === 0);
  },
  onReachBottom() {
    this.more();
  },
  replay(e) {
    wx.navigateTo({
      url: `/pages/replay/replay?gameId=${e.currentTarget.dataset.id}`,
    });
  },
});
