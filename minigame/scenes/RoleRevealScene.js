const RoomScene = require("./RoomScene");
const { theme } = require("../components/UI");
class RoleRevealScene extends RoomScene {
  render(u) {
    this.chrome(u, "身份揭晓", "请独自查看，不要向其他玩家展示");
    const r = this.role,
      g = this.game;
    if (!r || !g) return;
    const count = r.visiblePlayers?.length || 0,
      height = Math.max(480, 420 + Math.ceil(count / 3) * 106);
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 95 - u.content,
      height + 16,
      () => {
        u.card.draw(20, 0, 350, height, theme.card, theme.gold);
        u.text.draw(
          r.alignmentName + "阵营",
          40,
          24,
          14,
          r.alignmentCode === "GOOD" ? theme.good : theme.evil,
          true,
        );
        u.text.draw(r.roleName, 40, 58, 30, theme.text, true);
        u.text.draw(r.roleCode, 40, 105, 12, theme.gold);
        const c = u.ctx;
        c.beginPath();
        c.arc(195, 211, 62, 0, Math.PI * 2);
        c.fillStyle = theme.soft;
        c.fill();
        c.strokeStyle = theme.gold;
        c.lineWidth = 2;
        c.stroke();
        u.text.draw(r.roleCode.slice(0, 1), 178, 183, 48, theme.gold, true);
        u.text.draw(r.instruction, 40, 304, 14, theme.text, false, 310);
        u.text.draw("你的视野 · 仅你可见", 40, 373, 12, theme.gold, true);
        (r.visiblePlayers || []).forEach((p, i) => {
          const x = 36 + (i % 3) * 112,
            y = 410 + Math.floor(i / 3) * 106;
          u.avatar.draw(p.nickname, x, y);
          u.text.draw(p.nickname, x, y + 65, 11, theme.muted, false, 100);
          u.text.draw(p.hint || "", x, y + 83, 10, theme.gold, false, 100);
        });
        if (!count)
          u.text.draw("你无法看到其他玩家的身份", 40, 416, 13, theme.muted);
      },
    );
    u.button.draw(
      "role-confirm",
      r.confirmed
        ? "已确认 · " + g.confirmedCount + "/" + g.playerCount
        : "我已记住身份",
      28,
      u.height - u.bottom - 78,
      334,
      () => this.action(() => this.app.api.confirm(g.gameId)),
      { disabled: r.confirmed },
    );
  }
}
module.exports = RoleRevealScene;
