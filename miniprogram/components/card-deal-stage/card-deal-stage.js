const { CARDS, roleCard } = require('../../utils/cards');

const TIMING = { SHUFFLE: 850, DEALING: 550, FLIPPING: 620 };
const TRANSIENT = ['SHUFFLE', 'DEALING', 'FLIPPING'];

Component({
  properties: {
    gameId: Number,
    role: Object,
    busy: Boolean,
  },
  data: {
    dealStage: 'SHUFFLE',
    back: CARDS.back.ROLE,
    front: '',
    flipped: false,
    pile: [0, 1, 2, 3, 4, 5],
  },
  observers: {
    'gameId, role': function () { this.syncIdentity(); },
    busy(value) {
      if (!value && this.data.role && !this.data.role.confirmed)
        this.confirmRequested = false;
    },
  },
  lifetimes: {
    attached() { this.syncIdentity(); },
    detached() { this.cancelTimer(); },
  },
  pageLifetimes: {
    hide() {
      this.hidden = true;
      this.recoverAnimation();
    },
    show() {
      const wasHidden = this.hidden;
      this.hidden = false;
      this.syncIdentity();
      if (wasHidden) this.recoverAnimation();
    },
  },
  methods: {
    cancelTimer() {
      clearTimeout(this.stageTimer);
      this.stageTimer = null;
    },
    later(stage, callback) {
      this.cancelTimer();
      const gameId = this.identityGameId;
      this.stageTimer = setTimeout(() => {
        this.stageTimer = null;
        if (gameId === this.identityGameId && !this.hidden) callback.call(this);
      }, TIMING[stage]);
    },
    syncIdentity() {
      const { role, gameId } = this.data;
      if (!gameId || !role || !role.roleCode) return;
      if (this.identityGameId !== gameId) {
        this.cancelTimer();
        this.identityGameId = gameId;
        this.confirmRequested = false;
        this.revealReported = false;
        // No private front image is placed in the hidden card before a tap.
        this.setData({ dealStage: 'SHUFFLE', front: '', flipped: false });
        if (role.confirmed) return this.reveal();
        if (this.hidden) return this.setData({ dealStage: 'BACK' });
        this.later('SHUFFLE', function () {
          this.setData({ dealStage: 'DEALING' });
          this.later('DEALING', function () { this.setData({ dealStage: 'BACK' }); });
        });
      } else if (role.confirmed && this.data.dealStage !== 'REVEALED') {
        this.cancelTimer();
        this.reveal();
      }
      // Refreshing the same game's role never resets the deal or flip.
      if (!this.data.busy && !role.confirmed) this.confirmRequested = false;
    },
    recoverAnimation() {
      if (!TRANSIENT.includes(this.data.dealStage)) return;
      this.cancelTimer();
      if (this.data.dealStage === 'FLIPPING') this.reveal();
      else this.setData({ dealStage: 'BACK', flipped: false });
    },
    flip() {
      if (this.data.dealStage !== 'BACK' || !this.data.role || this.hidden) return;
      this.setData({ front: roleCard(this.data.role.roleCode), dealStage: 'FLIPPING' });
      this.setData({ flipped: true });
      this.later('FLIPPING', this.reveal);
    },
    reveal() {
      this.setData({
        front: roleCard(this.data.role.roleCode),
        flipped: true,
        dealStage: 'REVEALED',
      });
      if (!this.revealReported) {
        this.revealReported = true;
        this.triggerEvent('reveal', { gameId: this.identityGameId });
      }
    },
    confirm() {
      if (
        this.data.dealStage !== 'REVEALED' || this.data.busy ||
        this.data.role.confirmed || this.confirmRequested
      ) return;
      this.confirmRequested = true;
      this.triggerEvent('confirm', { gameId: this.identityGameId });
    },
  },
});
