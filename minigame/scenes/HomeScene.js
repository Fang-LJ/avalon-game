const BaseScene = require("./BaseScene");
const { theme } = require("../components/UI");
const { historyItem, RULE_TEXT } = require("../utils/presentation");
class HomeScene extends BaseScene {
  enter() {
    this.run(
      () =>
        Promise.all([
          this.app.api.profile(),
          this.app.api.currentRoom(),
          this.app.api.history(),
        ]),
      ([profile, room, history]) => {
        this.profile = profile;
        this.room = room;
        this.recent = history.items?.[0];
      },
    );
  }
  show() {
    this.enter();
  }
  render(u) {
    u.headerText("阿瓦隆", "与朋友开启一场阵营对决");
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 76 - u.content,
      560,
      () => {
        u.card.draw(20, 0, 350, 102);
        u.avatar.draw(this.profile?.nickname || "玩家", 36, 20);
        u.text.draw(
          this.profile?.nickname || "正在读取账号",
          110,
          22,
          18,
          theme.text,
          true,
          240,
        );
        u.text.draw(
          "AVALON · " + this.app.config.environment,
          110,
          55,
          12,
          theme.gold,
        );
        u.button.draw("create", "创建房间", 28, 145, 334, () =>
          this.app.go("CreateRoom"),
        );
        u.button.draw(
          "join",
          "加入房间",
          28,
          205,
          334,
          () => this.app.go("JoinRoom"),
          { color: theme.soft },
        );
        if (this.room)
          u.button.draw(
            "continue",
            "返回房间 " + this.room.roomCode,
            28,
            267,
            334,
            () => this.app.go("Lobby", { roomId: this.room.roomId }),
            { color: theme.soft },
          );
        u.text.draw("最近一局", 20, 338, 15, theme.text, true);
        if (this.recent) {
          const item = historyItem(this.recent);
          u.panel(
            item.title,
            [item.result + " · " + item.date, "查看完整复盘 ›"],
            372,
          );
          u.hit("recent", 20, 372, 350, 95, () =>
            this.app.go("Replay", { gameId: item.gameId, back: "Home" }),
          );
        } else u.panel("还没有战绩", ["创建或加入房间，开始你的第一局。"], 372);
        u.button.draw(
          "rules",
          "玩法与角色说明 ›",
          28,
          491,
          334,
          () => this.app.info("规则与角色", RULE_TEXT),
          { color: theme.soft },
        );
      },
    );
    u.tab.draw("Home");
  }
}
module.exports = HomeScene;
