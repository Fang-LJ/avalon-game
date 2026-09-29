Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    player: Object,
    compact: Boolean,
    lobby: Boolean,
    formal: Boolean,
    hideNickname: Boolean,
  },
  methods: {
    choose() {
      if (!this.data.player.disabled)
        this.triggerEvent('select', {
          playerId: this.data.player.playerId,
          seatNo: this.data.player.seatNo,
          empty: !!this.data.player.empty,
          me: !!this.data.player.me,
        });
    },
  },
});
