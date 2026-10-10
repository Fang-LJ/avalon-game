Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { missions: Array, current: Number, teamSizes: Array },
  data: { dots: [] },
  observers: {
    'missions,current,teamSizes': function (missions, current, teamSizes) {
      this.setData({
        dots: [1, 2, 3, 4, 5].map((n) => {
          const m = (missions || []).find((m) => m.missionNo === n && ['SUCCESS', 'FAILED'].includes(m.status));
          const status = m ? m.status : n === current ? 'CURRENT' : 'PENDING';
          const required = (teamSizes || [])[n - 1];
          return {
            n,
            status,
            completed: status === 'SUCCESS' || status === 'FAILED',
            label:
              status === 'SUCCESS'
                ? '✓'
                : status === 'FAILED'
                  ? '×'
                  : Number.isInteger(required) && required >= 2 && required <= 5 ? required : '–',
          };
        }),
      });
    },
  },
  methods: {
    missionTap(event) {
      const dot = this.data.dots.find(value => value.n === Number(event.currentTarget.dataset.missionNo));
      if (dot && dot.completed)
        this.triggerEvent('missiontap', { missionNo: dot.n, status: dot.status });
    },
  },
});
