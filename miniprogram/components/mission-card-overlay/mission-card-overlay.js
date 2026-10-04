Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    evil: Boolean,
    teamSize: Number,
    choice: String,
    busy: Boolean,
    successCard: String,
    failCard: String,
    cardBack: String,
  },
  methods: {
    chooseSuccess() {
      if (!this.data.busy) this.triggerEvent('success');
    },
    chooseFail() {
      if (!this.data.busy && this.data.evil) this.triggerEvent('fail');
    },
    submit() {
      if (!this.data.busy && (this.data.choice === 'SUCCESS' ||
          (this.data.evil && this.data.choice === 'FAIL')))
        this.triggerEvent('submit');
    },
    close() {
      if (!this.data.busy) this.triggerEvent('close');
    },
    votes() {
      if (!this.data.busy) this.triggerEvent('votes');
    },
    ignoreTouch() {},
  },
});
