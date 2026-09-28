class Auth {
  constructor(wx, config, session, request) {
    Object.assign(this, { wx, config, session, request, pending: null });
  }
  login(mockNumber = 1) {
    if (this.pending) return this.pending;
    // Never send a game code to the production Mini Program's identity resolver.
    if (this.config.environment === "prod")
      return Promise.reject(
        new Error("小游戏生产登录尚未启用，请使用已配置小游戏凭证的测试后端"),
      );
    const generation = this.session.generation;
    const mock =
      this.config.environment === "local" && this.config.mock === true;
    if (
      mock &&
      (!Number.isInteger(mockNumber) || mockNumber < 1 || mockNumber > 10)
    )
      return Promise.reject(new Error("模拟用户须为 1–10"));
    const credentials = mock
      ? Promise.resolve({ mockOpenid: "avalon_mock_" + mockNumber })
      : new Promise((resolve, reject) =>
          this.wx.login({
            success: (r) =>
              r.code
                ? resolve({ code: r.code })
                : reject(new Error("微信未返回 code")),
            fail: () => reject(new Error("微信登录失败，请重试")),
          }),
        );
    const task = credentials
      .then((data) => this.request("/auth/wx-login", "POST", data, false))
      .then((result) => {
        if (generation !== this.session.generation)
          throw new Error("登录已取消");
        this.session.set(result.token);
        return result;
      })
      .finally(() => {
        if (this.pending === task) this.pending = null;
      });
    this.pending = task;
    return task;
  }
  logout() {
    this.session.clear();
    this.pending = null;
  }
}
module.exports = Auth;
