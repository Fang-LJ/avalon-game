const contains = (r, x, y) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
class TouchManager {
  constructor(invalidate = () => {}) {
    this.invalidate = invalidate;
    this.regions = [];
    this.scrolls = [];
  }
  reset() {
    this.regions = [];
    this.scrolls = [];
  }
  add(region) {
    this.regions.push(region);
  }
  start(x, y, id = 0) {
    if (this.active) return;
    const target = [...this.regions].reverse().find((r) => contains(r, x, y));
    this.active = {
      x,
      y,
      lastY: y,
      id,
      target,
      scroll: [...this.scrolls].reverse().find((r) => contains(r, x, y)),
      moved: false,
    };
    this.pressed = target?.disabled ? null : target?.id;
    this.invalidate();
  }
  move(x, y, id = 0) {
    const a = this.active;
    if (!a || a.id !== id) return;
    if (Math.hypot(x - a.x, y - a.y) > 8) a.moved = true;
    if (a.moved) {
      this.pressed = null;
      if (a.scroll) a.scroll.scroll.drag(y - a.lastY);
    }
    a.lastY = y;
    this.invalidate();
  }
  end(x, y, id = 0) {
    const a = this.active;
    if (!a || a.id !== id) return;
    this.cancel();
    if (
      !a.moved &&
      a.target &&
      !a.target.disabled &&
      contains(a.target, x, y)
    ) {
      const live = this.regions.find((r) => r.id === a.target.id);
      if (live && !live.disabled && contains(live, x, y)) live.onTap?.();
    }
  }
  cancel() {
    this.active = null;
    this.pressed = null;
    this.invalidate();
  }
  bind(wx, scale) {
    const handle = (method) => (e) => {
      const t = (e.changedTouches || e.touches || [])[0];
      if (t)
        this[method](t.clientX / scale(), t.clientY / scale(), t.identifier);
    };
    wx.onTouchStart(handle("start"));
    wx.onTouchMove(handle("move"));
    wx.onTouchEnd(handle("end"));
    wx.onTouchCancel(() => this.cancel());
  }
}
module.exports = { TouchManager, contains };
