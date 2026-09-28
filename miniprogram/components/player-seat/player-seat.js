Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { player: Object, compact: Boolean },
  methods: {
    choose() {
      if (!this.data.player.disabled)
        this.triggerEvent('select', { playerId: this.data.player.playerId });
    },
  },
});
