Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { active: String, v3: Boolean },
  data: {
    v3Icons: {
      index: { index: '469dc', history: '704a9', me: '3bb5b' },
      history: { index: 'd397d', history: '37192', me: '3bb5b' },
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
