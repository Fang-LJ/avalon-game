Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { sheet: Object },
  methods: {
    choose(e) {
      const sheet = this.data.sheet, roleCode = e.currentTarget.dataset.roleCode;
      if (!sheet || ![...sheet.goodOptions, ...sheet.evilOptions].some(option => option.roleCode === roleCode)) return;
      this.triggerEvent('choose', { scope: sheet.scope, playerId: sheet.playerId, roleCode });
    },
    clear() {
      const sheet = this.data.sheet;
      if (sheet && sheet.currentRole) this.triggerEvent('clear', { scope: sheet.scope, playerId: sheet.playerId });
    },
    close() { if (this.data.sheet) this.triggerEvent('close', { scope: this.data.sheet.scope }); },
    ignoreTap() {},
  },
});
