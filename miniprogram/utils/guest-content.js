const { ROLE_NAMES, roleConfig, rules } = require('./presentation');
const { roleCard } = require('./cards');
const EVIL_ROLES = Object.freeze(['MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON', 'MINION']);
const ABILITIES = Object.freeze({
  MERLIN: '知道除莫德雷德以外的邪恶玩家，但不知道他们的具体身份。带领正义完成任务，同时隐藏自己，避免被刺客找出。',
  PERCIVAL: '看到梅林与莫甘娜这两名候选人，但无法区分谁是梅林。通过任务和表决判断真正的梅林。',
  LOYAL_SERVANT: '没有额外身份视野。观察组队、表决和任务结果，协助正义完成三个任务。',
  MORGANA: '在派西维尔的视野中伪装成梅林。与除奥伯伦以外的邪恶同伴互认，可以秘密提交失败牌。',
  ASSASSIN: '与除奥伯伦以外的邪恶同伴互认。正义完成三个任务后，刺中梅林即可逆转胜局；本项目也支持提前发动刺杀。',
  MORDRED: '不出现在梅林的邪恶视野中，但与除奥伯伦以外的邪恶同伴互认。可以秘密提交失败牌。',
  OBERON: '不与其他邪恶玩家互认，也不知道他们是谁。梅林仍能看到奥伯伦属于邪恶，可以秘密提交失败牌。',
  MINION: '与除奥伯伦以外的邪恶同伴互认。通过隐藏身份、干扰表决或提交失败牌阻止任务成功。',
});
function alignment(code) { return EVIL_ROLES.includes(code) ? 'EVIL' : 'GOOD'; }
const ROLES = Object.freeze(['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON', 'MINION']
  .map(code => Object.freeze({ code, name: ROLE_NAMES[code], card: roleCard(code), alignment: alignment(code),
    alignmentName: alignment(code) === 'GOOD' ? '正义阵营' : '邪恶阵营', ability: ABILITIES[code] })));
function configuration(count) {
  const rule = rules(count);
  return { count, ...rule, roles: Object.entries(roleConfig(count)).map(([code, quantity]) => ({
    code, quantity, name: ROLE_NAMES[code], alignment: alignment(code),
  })), tasks: rule.teamSizes.map((size, i) => ({ n: i + 1, size, fails: i === 3 ? rule.fourth : 1 })) };
}
const ROUTES = Object.freeze({ rules: '/pages/guide/guide', roles: '/pages/roles/roles',
  configuration: '/pages/configuration/configuration', demo: '/pages/demo-room/demo-room' });
function backToLogin() {
  if (getCurrentPages().length > 1) wx.navigateBack();
  else wx.reLaunch({ url: '/pages/login/login' });
}
module.exports = { EVIL_ROLES, ABILITIES, ROLES, alignment, configuration, ROUTES, backToLogin };
