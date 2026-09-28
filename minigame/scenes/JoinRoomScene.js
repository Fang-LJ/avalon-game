const BaseScene = require("./BaseScene");
const { parseRoomCode } = require("../js/InputController");
const { theme } = require("../components/UI");
class JoinRoomScene extends BaseScene {
  constructor(...args) {
    super(...args);
    this.code = "";
  }
  submit() {
    if (this.code.length === 6)
      this.run(
        () => this.app.api.join(this.code),
        (room) => this.app.go("Lobby", { roomId: room.roomId }),
      );
  }
  keyboard() {
    this.app.input.open({
      value: this.code,
      digits: true,
      onChange: (value) => {
        this.code = parseRoomCode(value);
        this.app.invalidate();
      },
      onConfirm: () => this.submit(),
      onError: () => this.app.toast("键盘暂不可用，请重试"),
    });
  }
  render(u) {
    u.headerText("加入房间", "输入朋友分享的 6 位房间号", () => this.back());
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - u.content,
      610,
      () => {
        u.card.draw(20, 5, 350, 150, theme.card, theme.gold);
        u.text.draw("AVALON", 132, 40, 26, theme.gold, true);
        u.text.draw("寻找你的圆桌伙伴", 130, 95, 13, theme.muted);
        u.text.draw("房间号", 28, 209, 14, theme.text, true);
        for (let i = 0; i < 6; i++) {
          u.card.draw(
            28 + i * 57,
            240,
            49,
            52,
            theme.soft,
            this.code[i] ? theme.gold : theme.border,
            12,
          );
          u.text.draw(
            this.code[i] || "—",
            44 + i * 57,
            254,
            22,
            this.code[i] ? theme.text : theme.muted,
            true,
            40,
          );
        }
        u.hit("room-input", 28, 240, 334, 52, () => this.keyboard());
        u.text.draw("点击输入框，调起系统键盘", 28, 311, 12, theme.muted);
        u.button.draw(
          "join-submit",
          "加入房间",
          28,
          365,
          334,
          () => this.submit(),
          { disabled: this.code.length !== 6 },
        );
        u.button.draw("scan", "扫码加入 · 暂未开放", 28, 425, 334, () => {}, {
          disabled: true,
          color: theme.soft,
        });
        u.panel(
          "温馨提示",
          ["请向房主获取房间号。开始后的对局无法中途加入。"],
          516,
        );
      },
    );
  }
}
module.exports = JoinRoomScene;
