const BaseScene = require("./BaseScene");
const { rules } = require("../utils/presentation");
const { theme } = require("../components/UI");
class CreateRoomScene extends BaseScene {
  constructor(...args) {
    super(...args);
    this.count = 8;
  }
  render(u) {
    u.headerText("创建房间", "选择人数 · 规则由服务端裁定", () => this.back());
    const r = rules(this.count);
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 95 - u.content,
      475,
      () => {
        u.card.draw(20, 0, 350, 116);
        u.text.draw("选择游戏人数", 36, 18, 15, theme.text, true);
        for (let n = 5; n <= 10; n++)
          u.button.draw(
            "count-" + n,
            String(n),
            34 + (n - 5) * 54,
            58,
            46,
            () => {
              this.count = n;
              this.app.invalidate();
            },
            { height: 38, color: n === this.count ? theme.accent : theme.soft },
          );
        u.panel(
          "角色配置 · " + r.good + " 正义 / " + r.evil + " 邪恶",
          [r.goodRoles, r.evilRoles],
          140,
        );
        u.panel(
          "对局规则",
          [
            "任务人数：" + r.teams.join(" / "),
            "第 4 任务需要 " + r.fourth + " 张 FAIL 才失败",
            "湖中仙女：" + (r.lady ? "启用" : "不启用"),
            "连续 5 次组队否决：邪恶获胜",
          ],
          300,
        );
      },
    );
    u.button.draw(
      "create-submit",
      this.busy ? "创建中…" : "创建房间",
      28,
      u.height - u.bottom - 78,
      334,
      () =>
        this.run(
          () => this.app.api.create(this.count),
          (room) => this.app.go("Lobby", { roomId: room.roomId }),
        ),
    );
  }
}
module.exports = CreateRoomScene;
