class Session {
  constructor(platform, config) {
    this.wx = platform;
    this.key =
      "AVALON_MINIGAME_SESSION:" + config.environment + ":" + config.api;
    this.generation = 0;
  }
  get() {
    return this.wx.getStorageSync(this.key) || "";
  }
  set(token) {
    if (typeof token !== "string" || !token)
      throw new Error("登录未返回有效凭证");
    this.wx.setStorageSync(this.key, token);
  }
  clear() {
    this.generation++;
    this.wx.removeStorageSync(this.key);
  }
}
module.exports = Session;
