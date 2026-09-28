Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { missions: Array, current: Number, good: Number, evil: Number },
  data: { dots: [] },
  observers: {
    'missions,current': function (missions, current) {
      this.setData({
        dots: [1, 2, 3, 4, 5].map((n) => {
          const m = (missions || []).find((m) => m.missionNo === n);
          const status = m ? m.status : n === current ? 'CURRENT' : 'PENDING';
          return {
            n,
            status,
            label:
              status === 'SUCCESS'
                ? '✓'
                : status === 'FAILED'
                  ? '×'
                  : status === 'CURRENT'
                    ? n
                    : '•',
          };
        }),
      });
    },
  },
});
