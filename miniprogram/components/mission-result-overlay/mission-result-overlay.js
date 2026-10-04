const { CARDS } = require('../../utils/cards');
const { normalizeResult, resultCards } = require('../../utils/mission-result');

const TIMING = { COLLECT: 400, SHUFFLE: 900, SPREAD: 400, REVEAL_GAP: 280, FLIP: 620, PAUSE: 400 };

Component({
  properties: {
    missionNo: Number,
    successCount: Number,
    failCount: Number,
    status: String,
    successCard: { type: String, value: CARDS.actions.SUCCESS },
    failCard: { type: String, value: CARDS.actions.FAIL },
    cardBack: { type: String, value: CARDS.back.ACTION },
    visible: Boolean,
  },
  data: { stage: 'COLLECT', cards: [], cardCount: 0 },
  observers: {
    'visible,missionNo,successCount,failCount,status': function () { this.syncResult(); },
  },
  lifetimes: {
    attached() { this.detached = false; this.syncResult(); },
    detached() { this.detached = true; this.cancelTimer(); },
  },
  pageLifetimes: {
    hide() { this.hidden = true; this.recoverAnimation(); },
    show() {
      const wasHidden = this.hidden;
      this.hidden = false;
      this.syncResult();
      if (wasHidden) this.recoverAnimation();
    },
  },
  methods: {
    cancelTimer() {
      this.generation = (this.generation || 0) + 1;
      clearTimeout(this.stageTimer);
      this.stageTimer = null;
    },
    later(delay, callback) {
      this.cancelTimer();
      const generation = this.generation;
      this.stageTimer = setTimeout(() => {
        this.stageTimer = null;
        if (generation === this.generation && !this.hidden && !this.detached && this.data.visible)
          callback.call(this);
      }, delay);
    },
    syncResult() {
      const result = normalizeResult(this.data);
      if (!this.data.visible || !result || this.detached) {
        this.cancelTimer();
        this.animationKey = null;
        return;
      }
      const key = `${result.missionNo}-${result.successCount}-${result.failCount}-${result.status}`;
      if (key === this.animationKey) return; // polling must not restart an animation
      this.cancelTimer();
      this.animationKey = key;
      this.confirmRequested = false;
      const cards = resultCards(result);
      this.setData({ stage: 'COLLECT', cards, cardCount: cards.length });
      if (this.hidden) return this.recoverAnimation();
      this.later(TIMING.COLLECT, function () {
        this.setData({ stage: 'SHUFFLE' });
        this.later(TIMING.SHUFFLE, function () {
          this.setData({ stage: 'SPREAD' });
          this.later(TIMING.SPREAD, function () {
            this.setData({ stage: 'REVEAL' });
            this.revealCard(0);
          });
        });
      });
    },
    revealCard(index) {
      this.setData({ cards: this.data.cards.map(card => ({ ...card, flipped: card.index <= index })) });
      if (index + 1 < this.data.cardCount)
        this.later(TIMING.REVEAL_GAP, function () { this.revealCard(index + 1); });
      else this.later(TIMING.FLIP + TIMING.PAUSE, this.showResult);
    },
    showResult() {
      this.setData({ stage: 'RESULT', cards: this.data.cards.map(card => ({ ...card, flipped: true })) });
    },
    recoverAnimation() {
      this.cancelTimer();
      if (this.data.visible && this.data.cards.length) this.showResult();
    },
    confirm() {
      if (!this.data.visible || this.hidden || this.detached || this.data.stage !== 'RESULT' || this.confirmRequested) return;
      this.confirmRequested = true;
      this.triggerEvent('confirm', { missionNo: this.data.missionNo });
    },
    ignoreTouch() {},
  },
});
