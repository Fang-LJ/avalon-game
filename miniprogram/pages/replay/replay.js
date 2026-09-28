const api = require('../../services/avalon');
const auth = require('../../services/auth');
const ui = require('../../utils/presentation');
Page({
  data: { gameId: null, replay: null, entries: [], error: '', loading: true },
  onLoad(options) {
    this.setData({ gameId: Number(options.gameId) });
  },
  onShow() {
    if (auth.requireSession()) this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const replay = await api.replay(this.data.gameId);
      const target = replay.players.find(
        (p) => p.playerId === replay.assassinationTargetPlayerId,
      );
      const duration =
        replay.startedAt && replay.finishedAt
          ? Math.max(
              0,
              Math.round(
                (Date.parse(replay.finishedAt) - Date.parse(replay.startedAt)) /
                  60000,
              ),
            )
          : null;
      this.setData({
        replay: {
          ...replay,
          reasonText: ui.FINISH[replay.finishReason] || replay.finishReason,
          duration,
          targetText: target
            ? target.nickname + '（' + target.roleName + '）'
            : '',
          timeText: ui.dateText(replay.finishedAt),
        },
        entries: ui.logs(replay, replay.players, true),
      });
    } catch (e) {
      this.setData({ error: e.message || '复盘加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
