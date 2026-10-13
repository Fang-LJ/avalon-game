const { configuration, backToLogin } = require('../../utils/guest-content');
Page({
  data: { counts: [5, 6, 7, 8, 9, 10], config: configuration(5) },
  choose(e) {
    const count = Number(e.currentTarget.dataset.count);
    if (this.data.counts.includes(count)) this.setData({ config: configuration(count) });
  },
  back: backToLogin,
});
