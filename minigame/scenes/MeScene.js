const BaseScene = require("./BaseScene");
const { theme } = require("../components/UI");
const { RULE_TEXT, LEGAL_TEXT } = require("../utils/presentation");
class MeScene extends BaseScene {
  enter() {
    this.run(
      () => Promise.all([this.app.api.profile(), this.app.api.stats()]),
      ([profile, stats]) => {
        this.profile = profile;
        this.stats = stats;
      },
    );
  }
  edit() {
    this.app.input.open({
      value: this.profile?.nickname || "",
      onChange: (value) => {
        this.draft = value;
      },
      onConfirm: (value) =>
        this.run(
          () => this.app.api.updateProfile(value),
          (profile) => {
            this.profile = profile;
          },
        ),
      onError: () => this.app.toast("键盘暂不可用"),
    });
  }
  render(u) {
    u.headerText("我的", "账号、战绩与设置");
    u.scroll(
      this.scroll,
      u.content,
      u.height - u.bottom - 76 - u.content,
      610,
      () => {
        u.card.draw(20, 0, 350, 116);
        u.avatar.draw(this.profile?.nickname || "玩家", 36, 18);
        u.text.draw(
          this.profile?.nickname || "读取中…",
          110,
          26,
          18,
          theme.text,
          true,
          240,
        );
        u.text.draw(
          this.app.config.environment === "local"
            ? "本地测试账号"
            : "微信账号已连接",
          110,
          55,
          11,
          theme.good,
        );
        u.text.draw("编辑昵称 ›", 36, 87, 12, theme.gold);
        u.hit("nickname", 20, 0, 350, 116, () => this.edit());
        u.panel(
          "我的数据",
          [
            "总对局 " +
              (this.stats?.totalGames || 0) +
              " · 胜率 " +
              (this.stats?.winRate || 0) +
              "%",
            "正义 " +
              (this.stats?.goodGames || 0) +
              " 局 · 邪恶 " +
              (this.stats?.evilGames || 0) +
              " 局",
            (this.stats?.roleCounts || [])
              .slice(0, 3)
              .map((r) => r.roleName + " " + r.games + " 局")
              .join(" · "),
          ],
          160,
        );
        [
          ["历史战绩 ›", () => this.app.go("History")],
          ["规则与角色说明 ›", () => this.app.info("规则与角色", RULE_TEXT)],
          [
            "Web 扫码登录说明 ›",
            () =>
              this.app.info("暂未开放", "当前请使用小游戏登录与房间号加入。"),
          ],
          [
            "用户协议与隐私政策 ›",
            () => this.app.info("用户协议与隐私说明", LEGAL_TEXT),
          ],
          [
            "关于阿瓦隆 ›",
            () =>
              this.app.info(
                "阿瓦隆 V1",
                "原生 Canvas 2D 微信小游戏 · 开发测试版本。",
              ),
          ],
        ].forEach(([label, tap], i) =>
          u.button.draw("setting-" + i, label, 20, 327 + i * 37, 350, tap, {
            height: 35,
            size: 13,
            color: theme.card,
          }),
        );
        u.button.draw(
          "logout",
          "退出登录 / 切换本地用户",
          28,
          550,
          334,
          () =>
            this.app.confirm(
              "退出登录",
              "将清除本机小游戏会话，不影响普通小程序。",
              () => this.app.logout(),
            ),
          { color: theme.soft },
        );
      },
    );
    u.tab.draw("Me");
  }
}
module.exports = MeScene;
