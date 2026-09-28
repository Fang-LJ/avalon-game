const BaseScene = require("./BaseScene");
const { theme } = require("../components/UI");
const { LEGAL_TEXT } = require("../utils/presentation");
class LoginScene extends BaseScene {
  constructor(...args) {
    super(...args);
    this.mockNumber = 1;
  }
  login() {
    this.run(
      () => this.app.auth.login(this.mockNumber),
      () => this.app.go("Home"),
    );
  }
  render(u) {
    const y = Math.max(u.content, 130),
      c = u.ctx;
    c.beginPath();
    c.arc(195, y + 46, 45, 0, Math.PI * 2);
    c.fillStyle = theme.card;
    c.fill();
    c.strokeStyle = theme.gold;
    c.lineWidth = 2;
    c.stroke();
    u.text.draw("A", 182, y + 22, 38, theme.gold, true);
    u.text.draw("阿瓦隆", 150, y + 118, 30, theme.text, true);
    u.text.draw("AVALON", 171, y + 163, 12, theme.gold, true);
    u.text.draw(
      "在谎言与忠诚之间，找到真正的同伴。",
      67,
      y + 215,
      14,
      theme.muted,
      false,
      270,
    );
    const local =
      this.app.config.environment === "local" && this.app.config.mock;
    const buttonY = Math.min(590, u.height - u.bottom - 205);
    if (local) {
      u.text.draw(
        "本地模拟用户（仅 local）",
        100,
        buttonY - 96,
        12,
        theme.gold,
      );
      for (let i = 1; i <= 10; i++)
        u.button.draw(
          "mock-" + i,
          String(i),
          28 + ((i - 1) % 5) * 68,
          buttonY - 70 + Math.floor((i - 1) / 5) * 30,
          62,
          () => {
            this.mockNumber = i;
            this.app.invalidate();
          },
          {
            height: 26,
            size: 12,
            color: this.mockNumber === i ? theme.accent : theme.soft,
          },
        );
    }
    u.button.draw(
      "login",
      this.busy ? "登录中…" : local ? "本地测试登录" : "微信授权登录",
      28,
      buttonY,
      334,
      () => this.login(),
    );
    u.text.draw(
      "首次登录将自动创建阿瓦隆账号",
      99,
      buttonY + 64,
      11,
      theme.muted,
    );
    u.text.draw(
      local
        ? "连接本地后端，不会访问生产登录"
        : "请使用已配置小游戏凭证的测试后端",
      80,
      buttonY + 88,
      11,
      theme.gold,
    );
    u.text.draw(
      "登录即代表同意《用户协议》与《隐私政策》",
      63,
      buttonY + 126,
      10,
      theme.muted,
      false,
      280,
    );
    u.hit("legal", 28, buttonY + 114, 334, 45, () =>
      this.app.info("用户协议与隐私说明", LEGAL_TEXT),
    );
  }
}
module.exports = LoginScene;
