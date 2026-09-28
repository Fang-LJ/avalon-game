Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { entries: Array, replay: Boolean },
  data: { expanded: false },
  methods: {
    toggle() {
      this.setData({ expanded: !this.data.expanded });
    },
  },
});
