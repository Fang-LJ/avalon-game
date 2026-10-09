Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { detail: Object },
  methods: {
    close() { this.triggerEvent('close'); },
    ignoreTap() {},
  },
});
