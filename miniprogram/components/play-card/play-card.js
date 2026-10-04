const { CARDS } = require('../../utils/cards');

Component({
  properties: {
    front: { type: String, value: '' },
    back: { type: String, value: CARDS.back.ROLE },
    flipped: Boolean,
    selected: Boolean,
    disabled: Boolean,
    size: { type: String, value: 'medium' },
    resultCount: { type: Number, value: 2 },
    interactive: { type: Boolean, value: true },
  },
  methods: {
    choose() {
      if (!this.data.disabled && this.data.interactive)
        this.triggerEvent('select', { flipped: this.data.flipped });
    },
  },
});
