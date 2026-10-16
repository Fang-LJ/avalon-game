const api = require('../../services/avalon');
const auth = require('../../services/auth');
const ui = require('../../utils/presentation');
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
      { key: '', tone: 'all', label: '全部' },
      { key: 'GOOD', tone: 'good', label: '正义' },
      { key: 'EVIL', tone: 'evil', label: '邪恶' },
    ],
  },
  onShow() {
    if (!auth.requireSession()) return;
    this.load(true);
  },
  async load(reset = false) {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    const page = reset ? 1 : this.data.page + 1;
    try {
      const [result, stats] = await Promise.all([
        api.history(page, 10, this.data.alignment),
        api.stats(),
      ]);
      this.setData({
        stats,
        recordWinPercent: stats.wins + stats.losses > 0 ? stats.wins * 100 / (stats.wins + stats.losses) : 0,
        recordLossPercent: stats.wins + stats.losses > 0 ? stats.losses * 100 / (stats.wins + stats.losses) : 0,
        items: (reset ? [] : this.data.items).concat(
          result.items.map(ui.historyItem),
        ),
        total: result.total,
        page,
      });
    } catch (_) {
      this.setData({ error: '战绩加载失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
  filter(e) {
    if (this.data.loading) return;
    this.setData({
      alignment: e.currentTarget.dataset.key,
      items: [],
      page: 0,
      total: 0,
    });
    this.load(true);
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
