// Only /my-role chooses a role card during a live game.
const CARDS = {
  roles: {
    MERLIN: '/assets/cards/roles/merlin.jpg',
    PERCIVAL: '/assets/cards/roles/percival.jpg',
    LOYAL_SERVANT: '/assets/cards/roles/loyal-servant.jpg',
    MORGANA: '/assets/cards/roles/morgana.jpg',
    ASSASSIN: '/assets/cards/roles/assassin.jpg',
    MINION: '/assets/cards/roles/minion.jpg',
    MORDRED: '/assets/cards/roles/mordred.jpg',
    OBERON: '/assets/cards/roles/oberon.jpg',
  },
  actions: {
    SUCCESS: '/assets/cards/actions/mission-success.jpg',
    FAIL: '/assets/cards/actions/mission-fail.jpg',
    APPROVE: '/assets/cards/actions/approve.jpg',
    REJECT: '/assets/cards/actions/reject.jpg',
  },
  special: {
    LADY_OF_THE_LAKE: '/assets/cards/special/lady-of-the-lake.jpg',
    ASSASSINATE: '/assets/cards/special/assassinate.jpg',
    GOOD_VICTORY: '/assets/cards/special/good-victory.jpg',
    EVIL_VICTORY: '/assets/cards/special/evil-victory.jpg',
    GENERIC_EMBLEM: '/assets/cards/special/generic-emblem.jpg',
  },
  back: {
    ROLE: '/assets/cards/back/role-back.jpg',
    ACTION: '/assets/cards/back/action-back.jpg',
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
