// Only /my-role chooses a role card during a live game.
const CARDS = {
  roles: {
    MERLIN: '/assets/cards/roles/merlin.webp',
    PERCIVAL: '/assets/cards/roles/percival.webp',
    LOYAL_SERVANT: '/assets/cards/roles/loyal-servant.webp',
    MORGANA: '/assets/cards/roles/morgana.webp',
    ASSASSIN: '/assets/cards/roles/assassin.webp',
    MINION: '/assets/cards/roles/minion.webp',
    MORDRED: '/assets/cards/roles/mordred.webp',
    OBERON: '/assets/cards/roles/oberon.webp',
  },
  actions: {
    SUCCESS: '/assets/cards/actions/mission-success.jpg',
    FAIL: '/assets/cards/actions/mission-fail.jpg',
    APPROVE: '/assets/cards/actions/approve.webp',
    REJECT: '/assets/cards/actions/reject.webp',
  },
  special: {
    LADY_OF_THE_LAKE: '/assets/cards/special/lady-of-the-lake.webp',
    ASSASSINATE: '/assets/cards/special/assassinate.webp',
    GOOD_VICTORY: '/assets/cards/special/good-victory.webp',
    EVIL_VICTORY: '/assets/cards/special/evil-victory.webp',
    GENERIC_EMBLEM: '/assets/cards/special/generic-emblem.webp',
  },
  back: {
    ROLE: '/assets/cards/back/role-back.webp',
    ACTION: '/assets/cards/back/action-back.webp',
  },
};
Object.values(CARDS).forEach(Object.freeze);
Object.freeze(CARDS);

function lookup(group, type, fallback) {
  return Object.prototype.hasOwnProperty.call(group, type) ? group[type] : fallback;
}

module.exports = {
  CARDS,
  roleCard: (code) => lookup(CARDS.roles, code, CARDS.back.ROLE),
  actionCard: (type) => lookup(CARDS.actions, type, CARDS.back.ACTION),
  specialCard: (type) => lookup(CARDS.special, type, CARDS.special.GENERIC_EMBLEM),
};
