class SceneManager {
  constructor(app, registry) {
    this.app = app;
    this.registry = registry;
  }
  go(name, params = {}) {
    const Scene = this.registry[name];
    if (!Scene) throw new Error("未知场景 " + name);
    this.current?.dispose();
    this.app.input.close();
    this.app.touch.cancel();
    this.current = new Scene(this.app, params);
    this.name = name;
    this.current.enter();
    this.app.invalidate();
  }
}
module.exports = SceneManager;
