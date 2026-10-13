const { readNavigationMetrics } = require('../../utils/guest-navigation');
Component({
  properties: { title: String, subtitle: String },
  data: { navTop: 24, navHeight: 32, navWidth: 288, contentTop: 68 },
  lifetimes: { attached() { this.updateLayout(); } },
  pageLifetimes: { resize() { this.updateLayout(); } },
  methods: {
    updateLayout() { this.setData(readNavigationMetrics()); },
    back() { this.triggerEvent('back'); },
  },
});
