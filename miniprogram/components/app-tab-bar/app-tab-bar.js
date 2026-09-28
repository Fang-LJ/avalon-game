Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { active: String },
  data: {
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
