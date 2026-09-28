const RoomScene = require("./RoomScene");
const { theme } = require("../components/UI");
const { rules } = require("../utils/presentation");
class LobbyScene extends RoomScene {
  render(u) {
    const r = this.room;
    this.chrome(u, "等待大厅", r ? "房间 " + r.roomCode : "正在同步房间…");
    if (!r) return;
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 146 - u.content,
      270 + Math.ceil(r.maxPlayers / 3) * 110,
      () => {
        u.panel(
          "房间号 " + r.roomCode,
          [r.currentPlayers + " / " + r.maxPlayers + " 人 · 等待玩家入座"],
          0,
        );
        for (let i = 0; i < r.maxPlayers; i++) {
          const p = r.players[i] || { nickname: "等待加入", online: false };
          u.seat.draw(p, 29 + (i % 3) * 125, 126 + Math.floor(i / 3) * 110);
        }
        const rule = rules(r.maxPlayers);
        u.panel(
          "角色配置",
          [rule.goodRoles, rule.evilRoles],
          140 + Math.ceil(r.maxPlayers / 3) * 110,
        );
      },
    );
    u.button.draw(
      "start",
      r.host ? "开始游戏" : "等待房主开始",
      28,
      u.height - u.bottom - 134,
      334,
      () => this.action(() => this.app.api.start(r.roomId)),
      { disabled: !r.canStart || !r.host },
    );
    u.button.draw(
      "leave",
      "退出房间",
      28,
      u.height - u.bottom - 74,
      334,
      () => this.leave(),
      { color: theme.soft },
    );
  }
}
module.exports = LobbyScene;
