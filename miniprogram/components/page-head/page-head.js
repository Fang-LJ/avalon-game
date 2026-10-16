Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: { title: String, subtitle: String, back: Boolean, compact: Boolean, contained: Boolean, v3: Boolean },
  data: { top: 48, v3Right: 0 },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync();
      const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      this.setData({
        top: Math.max((info.statusBarHeight || 20) + 8, 48),
        v3Right: capsule && capsule.left ? Math.max(0, (info.windowWidth || 390) - capsule.left + 12) : 0,
      });
    },
  },
  methods: {
    goBack() {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.reLaunch({ url: '/pages/index/index' });
    },
  },
});
