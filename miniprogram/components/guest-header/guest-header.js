Component({
  properties: { title: String, subtitle: String },
  data: { top: 56 },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      this.setData({ top: Math.max((info.statusBarHeight || 20) + 40, capsule ? capsule.bottom + 12 : 0) });
    },
  },
  methods: { back() { this.triggerEvent('back'); } },
});
