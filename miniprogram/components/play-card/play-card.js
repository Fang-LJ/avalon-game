const { CARDS } = require('../../utils/cards');
const CARD_SOURCES = Object.values(CARDS).flatMap(Object.values);

function logCardImage(kind, event) {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
    if (envVersion !== 'develop' && envVersion !== 'trial') return;
    const { side, src } = event.currentTarget.dataset;
    // Only manifest artwork; never log arbitrary URLs, component data or user profiles.
    if (!['front', 'back'].includes(side) || !CARD_SOURCES.includes(src)) return;
    const fields = { type: side, src, envVersion };
    if (kind === 'ERROR') {
      fields.errMsg = String(event.detail?.errMsg || 'image load failed')
        .replace(/(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
        .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
        .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g, '[REDACTED]')
        .replace(/\b(token|authorization|appsecret|secret|password|code)\s*["']?\s*[:=]\s*["']?[^\s,;"']+/gi, '$1=[REDACTED]');
      console.error('[CARD IMAGE ERROR]', fields);
    } else console.info('[CARD IMAGE LOAD]', fields);
  } catch (_) {
    // Old SDKs/console errors must not affect card selection or animation.
  }
}

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
    imageLoaded(event) { logCardImage('LOAD', event); },
    imageError(event) { logCardImage('ERROR', event); },
    choose() {
      if (!this.data.disabled && this.data.interactive)
        this.triggerEvent('select', { flipped: this.data.flipped });
    },
  },
});
