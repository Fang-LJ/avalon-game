// Only /my-role chooses a role card during a live game.
const CARD_BASE = require('./config').getConfig().cardBaseUrl;
const CARDS = {
  roles: {
    MERLIN: `${CARD_BASE}/roles/merlin.jpg`,
    PERCIVAL: `${CARD_BASE}/roles/percival.jpg`,
    LOYAL_SERVANT: `${CARD_BASE}/roles/loyal-servant.jpg`,
    MORGANA: `${CARD_BASE}/roles/morgana.jpg`,
    ASSASSIN: `${CARD_BASE}/roles/assassin.jpg`,
    MINION: `${CARD_BASE}/roles/minion.jpg`,
    MORDRED: `${CARD_BASE}/roles/mordred.jpg`,
    OBERON: `${CARD_BASE}/roles/oberon.jpg`,
  },
  actions: {
    SUCCESS: `${CARD_BASE}/actions/mission-success.jpg`,
    FAIL: `${CARD_BASE}/actions/mission-fail.jpg`,
    APPROVE: `${CARD_BASE}/actions/approve.jpg`,
    REJECT: `${CARD_BASE}/actions/reject.jpg`,
  },
  special: {
    LADY_OF_THE_LAKE: `${CARD_BASE}/special/lady-of-the-lake.jpg`,
    ASSASSINATE: `${CARD_BASE}/special/assassinate.jpg`,
    GOOD_VICTORY: `${CARD_BASE}/special/good-victory.jpg`,
    EVIL_VICTORY: `${CARD_BASE}/special/evil-victory.jpg`,
    GENERIC_EMBLEM: `${CARD_BASE}/special/generic-emblem.jpg`,
  },
  back: {
    ROLE: `${CARD_BASE}/back/role-back.jpg`,
    ACTION: `${CARD_BASE}/back/action-back.jpg`,
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
