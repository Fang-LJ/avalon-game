Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    player: Object,
    compact: Boolean,
    dense: Boolean,
    lobby: Boolean,
    formal: Boolean,
    hideNickname: Boolean,
    guessEnabled: Boolean,
  },
  methods: {
    beginTouch() {
      // A genuinely new gesture releases suppression. Never use a timer that can expire
      // while the user is still holding, or swallow a later independent quick tap.
      this.suppressNextTap = false;
    },
    longPress() {
      this.suppressNextTap = true;
      const player = this.data.player;
      if (this.data.guessEnabled && player && !player.empty && !player.me)
        this.triggerEvent('guess', { playerId: player.playerId, seatNo: player.seatNo });
    },
    choose() {
      if (this.suppressNextTap) return;
      if (!this.data.player.disabled && !this.data.player.unselectable)
        this.triggerEvent('select', {
          playerId: this.data.player.playerId,
          seatNo: this.data.player.seatNo,
          empty: !!this.data.player.empty,
          me: !!this.data.player.me,
        });
    },
  },
});
