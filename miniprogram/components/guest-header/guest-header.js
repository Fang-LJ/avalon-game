const { readNavigationMetrics } = require('../../utils/guest-navigation');
Component({
  properties: { goldTitle: Boolean, title: String, subtitle: String, backLabel: { type: String, value: '返回主页' } },
  data: { navTop: 24, navHeight: 32, navWidth: 288, contentTop: 68 },
  lifetimes: { attached() { this.updateLayout(); } },
  pageLifetimes: { resize() { this.updateLayout(); } },
  methods: {
    updateLayout() { this.setData(readNavigationMetrics()); },
    back() { this.triggerEvent('back'); },
  },
});
