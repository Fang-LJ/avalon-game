Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { active: String, v3: Boolean },
  data: {
    v3Icons: {
      index: { index: '870a7', history: '54e46', me: '85f68' },
      history: { index: 'adbbe', history: 'b3b34', me: '85f68' },
      me: { index: 'b731c', history: '0dad3', me: 'fe44b' },
    },
    tabs: [
      { key: 'index', icon: '⌂', label: '首页' },
      { key: 'history', icon: '◫', label: '战绩' },
      { key: 'me', icon: '●', label: '我的' },
    ],
  },
  methods: {
    open(e) {
      const key = e.currentTarget.dataset.key;
      if (key !== this.data.active)
        wx.reLaunch({ url: `/pages/${key}/${key}` });
    },
  },
});
