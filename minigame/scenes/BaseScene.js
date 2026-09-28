const ScrollView = require("../components/ScrollView");
class BaseScene {
  constructor(app, params = {}) {
    this.app = app;
    this.params = params;
    this.alive = true;
    this.scroll = new ScrollView();
    this.busy = false;
  }
  enter() {}
  dispose() {
    this.alive = false;
    this.app.input.close();
  }
  hide() {
    this.app.input.close();
  }
  show() {}
  async run(work, success) {
    if (this.busy) return;
    this.busy = true;
    this.app.invalidate();
    try {
      const result = await work();
      if (this.alive) success?.(result);
    } catch (e) {
      if (this.alive) this.app.toast(e.message);
    } finally {
      if (this.alive) {
        this.busy = false;
        this.app.invalidate();
      }
    }
  }
  back(name = "Home") {
    this.app.go(name);
  }
}
module.exports = BaseScene;
