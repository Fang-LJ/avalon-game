const BaseScene = require("./BaseScene");
const { logs, FINISH } = require("../utils/presentation");
const { theme } = require("../components/UI");
class ReplayScene extends BaseScene {
  enter() {
    this.run(
      () => this.app.api.replay(this.params.gameId),
      (data) => {
        this.data = data;
        this.items = logs(data, data.players, true);
      },
    );
  }
  dispose() {
    super.dispose();
    this.data = null;
    this.items = null;
  }
  hide() {
    super.hide();
    this.data = null;
    this.items = null;
  }
  show() {
    this.enter();
  }
  render(u) {
    const d = this.data;
    u.headerText(
      "对局复盘",
      d
        ? d.playerCount + " 人局 · " + (FINISH[d.finishReason] || "对局结束")
        : "仅结束后本局参与者可查看",
      () =>
        this.app.go(this.params.back || "History", {
          roomId: this.params.roomId,
        }),
    );
    if (!d) return;
    const identities = d.players.map(
      (p) => p.nickname + " · " + (p.roleName || p.roleCode),
    );
    const intro = 74 + identities.length * 20;
    const entries = this.items.map((item) => ({
      ...item,
      height:
        62 +
        item.lines.reduce(
          (sum, line) => sum + Math.ceil(Math.max(1, line.length) / 25) * 20,
          0,
        ),
    }));
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - u.content,
      intro + entries.reduce((sum, e) => sum + e.height, 0) + 160,
      () => {
        u.panel("身份公开", identities, 0);
        let y = intro;
        for (const item of entries) {
          u.panel(item.title, item.lines, y);
          y += item.height;
        }
        const target = d.players.find(
          (p) =>
            (p.playerId || p.gamePlayerId || p.id) ===
            d.assassinationTargetPlayerId,
        );
        u.panel(
          "最终结果",
          [
            (d.winner === "GOOD" ? "正义" : "邪恶") + "胜利",
            FINISH[d.finishReason] || d.finishReason,
            "刺杀目标：" + (target?.nickname || "无"),
          ],
          y,
          d.winner === "GOOD" ? theme.good : theme.evil,
        );
      },
    );
  }
}
module.exports = ReplayScene;
