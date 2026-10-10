// Only /my-role chooses a role card during a live game.
const CARD_BASE = require('./config').getConfig().cardBaseUrl;
const CARDS = {
  roles: {
    MERLIN: `${CARD_BASE}/roles/merlin.png`,
    PERCIVAL: `${CARD_BASE}/roles/percival.png`,
    LOYAL_SERVANT: `${CARD_BASE}/roles/loyal-servant.png`,
    MORGANA: `${CARD_BASE}/roles/morgana.png`,
    ASSASSIN: `${CARD_BASE}/roles/assassin.png`,
    MINION: `${CARD_BASE}/roles/minion.png`,
    MORDRED: `${CARD_BASE}/roles/mordred.png`,
    OBERON: `${CARD_BASE}/roles/oberon.png`,
  },
  actions: {
    SUCCESS: `${CARD_BASE}/actions/mission-success.png`,
    FAIL: `${CARD_BASE}/actions/mission-fail.png`,
    APPROVE: `${CARD_BASE}/actions/approve.png`,
    REJECT: `${CARD_BASE}/actions/reject.png`,
  },
  special: {
    LADY_OF_THE_LAKE: `${CARD_BASE}/special/lady-of-the-lake.png`,
    ASSASSINATE: `${CARD_BASE}/special/assassinate.png`,
    GOOD_VICTORY: `${CARD_BASE}/special/good-victory.png`,
    EVIL_VICTORY: `${CARD_BASE}/special/evil-victory.png`,
    GENERIC_EMBLEM: `${CARD_BASE}/special/generic-emblem.png`,
  },
  back: {
    ROLE: `${CARD_BASE}/back/role-back.png`,
    ACTION: `${CARD_BASE}/back/action-back.png`,
  },
};
Object.values(CARDS).forEach(Object.freeze);
Object.freeze(CARDS);

function lookup(group, type, fallback) {
  return Object.prototype.hasOwnProperty.call(group, type) ? group[type] : fallback;
}

module.exports = {
  CARD_BASE,
  CARDS,
  roleCard: (code) => lookup(CARDS.roles, code, CARDS.back.ROLE),
  actionCard: (type) => lookup(CARDS.actions, type, CARDS.back.ACTION),
  specialCard: (type) => lookup(CARDS.special, type, CARDS.special.GENERIC_EMBLEM),
};
