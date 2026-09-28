Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: { title: String, subtitle: String, back: Boolean },
  data: { top: 48 },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync();
      this.setData({ top: Math.max((info.statusBarHeight || 20) + 8, 48) });
    },
  },
  methods: {
    goBack() {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.reLaunch({ url: '/pages/index/index' });
    },
  },
});
