const { getConfig } = require("../services/config");
const Session = require("../services/session");
const Auth = require("../services/auth");
const createRequest = require("../services/request");
const createApi = require("../services/avalon");
const Socket = require("../services/socket");
const { TouchManager } = require("./TouchManager");
const { InputController } = require("./InputController");
const SceneManager = require("./SceneManager");
const { viewport } = require("../utils/layout");
const { UI } = require("../components/UI");
class GameApp {
  constructor(wx, config = getConfig()) {
    this.wx = wx;
    this.config = config;
    this.active = true;
    this.canvas = wx.createCanvas();
    this.ctx = this.canvas.getContext("2d");
    this.session = new Session(wx, config);
    this.auth = new Auth(
      wx,
      config,
      this.session,
      createRequest(wx, config, this.session, () => this.logout()),
    );
    this.api = createApi(
      createRequest(wx, config, this.session, () => this.logout()),
    );
    this.socket = new Socket(wx, config, this.session);
    this.touch = new TouchManager(() => this.invalidate());
    this.input = new InputController(wx);
    this.ui = new UI(this, this.ctx, this.touch);
    this.scenes = new SceneManager(this, require("../scenes/index"));
    this.resize();
    this.touch.bind(wx, () => this.view.scale);
    wx.onHide(() => {
      this.active = false;
      this.touch.cancel();
      this.input.close();
      this.modal = null;
      this.socket.close();
      this.scenes.current?.hide();
    });
    wx.onShow(() => {
      this.active = true;
      this.scenes.current?.show();
      this.invalidate();
    });
    wx.onWindowResize?.(() => this.resize());
  }
  resize() {
    this.view = viewport(this.wx.getWindowInfo());
    this.canvas.width = Math.round(this.view.width * this.view.dpr);
    this.canvas.height = Math.round(this.view.height * this.view.dpr);
    this.invalidate();
  }
  start() {
    this.go("Login");
    if (this.session.get()) {
      const scene = this.scenes.current;
      scene.run(
        () => this.api.profile(),
        () => this.go("Home"),
      );
    }
  }
  go(name, params) {
    this.modal = null;
    this.message = null;
    this.scenes.go(name, params);
  }
  invalidate() {
    if (!this.active || this.frame) return;
    this.frame = setTimeout(() => {
      this.frame = null;
      if (!this.active) return;
      const c = this.ctx,
        v = this.view;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.scale(v.dpr, v.dpr);
      c.scale(v.scale, v.scale);
      this.ui.begin(v);
      if (this.scenes.current) {
        this.ui.disabled = this.scenes.current.busy;
        this.scenes.current.render(this.ui);
      }
      this.ui.disabled = false;
      if (this.modal) this.ui.modal.draw(this.modal);
      if (this.message) this.ui.toast.draw(this.message);
    }, 16);
  }
  toast(message) {
    this.message = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.message = null;
      this.invalidate();
    }, 4000);
    this.invalidate();
  }
  info(title, text) {
    this.modal = { title, text };
    this.invalidate();
  }
  confirm(title, text, confirm) {
    this.modal = { title, text, confirm, cancel: true, confirmText: "确认" };
    this.invalidate();
  }
  logout() {
    this.socket.close();
    this.auth.logout();
    this.go("Login");
  }
}
module.exports = GameApp;
