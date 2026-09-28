const BaseScene = require("./BaseScene");
const { theme } = require("../components/UI");
const { historyItem } = require("../utils/presentation");
class HistoryScene extends BaseScene {
  constructor(...args) {
    super(...args);
    this.items = [];
    this.page = 0;
    this.total = 0;
    this.alignment = "";
  }
  enter() {
    this.load(true);
  }
  load(reset = false) {
    if (this.busy) return;
    const page = reset ? 1 : this.page + 1;
    this.run(
      () =>
        Promise.all([
          this.app.api.history(page, this.alignment),
          this.app.api.stats(),
        ]),
      ([data, stats]) => {
        this.items = (reset ? [] : this.items).concat(
          data.items.map(historyItem),
        );
        this.page = page;
        this.total = data.total;
        this.stats = stats;
        if (reset) this.scroll.offset = 0;
      },
    );
  }
  render(u) {
    u.headerText("历史战绩", "你的每一局阿瓦隆");
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 76 - u.content,
      195 + this.items.length * 120 + 80,
      () => {
        u.panel(
          (this.stats?.totalGames || 0) + " 场对局",
          [
            (this.stats?.wins || 0) +
              " 胜 · " +
              (this.stats?.losses || 0) +
              " 负 · 胜率 " +
              (this.stats?.winRate || 0) +
              "%",
          ],
          0,
        );
        [
          ["", "全部"],
          ["GOOD", "正义"],
          ["EVIL", "邪恶"],
        ].forEach(([value, label], i) =>
          u.button.draw(
            "filter-" + value,
            label,
            36 + i * 82,
            97,
            72,
            () => {
              if (this.busy) return;
              this.alignment = value;
              this.load(true);
            },
            {
              height: 32,
              size: 12,
              color: this.alignment === value ? theme.accent : theme.soft,
            },
          ),
        );
        u.text.draw("最近对局", 20, 155, 15, theme.text, true);
        if (!this.items.length)
          u.text.draw(
            this.busy ? "加载中…" : "暂无战绩",
            28,
            209,
            14,
            theme.muted,
          );
        this.items.forEach((item, i) => {
          const y = 195 + i * 120;
          u.panel(
            item.title,
            [item.result, item.date + " · 查看复盘 ›"],
            y,
            item.good ? theme.good : theme.evil,
          );
          u.hit("history-" + item.gameId, 20, y, 350, 108, () =>
            this.app.go("Replay", { gameId: item.gameId, back: "History" }),
          );
        });
        if (this.items.length < this.total)
          u.button.draw(
            "more",
            "加载更多",
            28,
            195 + this.items.length * 120,
            334,
            () => this.load(),
            { color: theme.soft },
          );
      },
    );
    u.tab.draw("History");
  }
}
module.exports = HistoryScene;
