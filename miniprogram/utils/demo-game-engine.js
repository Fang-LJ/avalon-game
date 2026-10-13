const ui = require('./presentation');
const { alignment, ABILITIES } = require('./guest-content');
const copy = value => JSON.parse(JSON.stringify(value));
let sequence = 0;
const requireAction = (condition, message) => { if (!condition) throw new Error(message); };

function createGame({ random = Math.random } = {}) {
  const gameId = ++sequence, rule = ui.rules(5);
  // Secret roles, votes and mission choices never leave this closure unprojected.
  const players = [{ playerId: 1, seatNo: 1, nickname: '体验玩家', avatarUrl: '/assets/guest/default-avatar.svg', me: true, isBot: false }];
  let phase = 'WAITING', revision = 0, disposed = false, leader = 1, round = 1, proposalNo = 1;
  let rejections = 0, goodScore = 0, evilScore = 0, team = [], votes = {}, actions = {};
  let confirmed = [], proposals = [], missions = [], latestResult = null, winner = null, reason = '', assassinationTarget = null;
  const ids = () => players.map(p => p.playerId);
  const member = id => players.find(p => p.playerId === id);
  const phaseIs = expected => requireAction(phase === expected, '当前阶段不能执行此操作');
  const nextLeader = () => { leader = leader % 5 + 1; };
  const finish = (side, why) => { phase = 'FINISHED'; winner = side; reason = why; };
  const visiblePlayers = viewer => players.filter(p => {
    if (viewer.roleCode === 'MERLIN') return alignment(p.roleCode) === 'EVIL' && p.roleCode !== 'MORDRED';
    if (viewer.roleCode === 'PERCIVAL') return ['MERLIN', 'MORGANA'].includes(p.roleCode);
    return ['MORGANA', 'ASSASSIN', 'MINION', 'MORDRED'].includes(viewer.roleCode) &&
      p.playerId !== viewer.playerId && alignment(p.roleCode) === 'EVIL' && p.roleCode !== 'OBERON';
  }).map(p => {
    const knowledgeType = viewer.roleCode === 'MERLIN' ? 'EVIL' : viewer.roleCode === 'PERCIVAL' ? 'MERLIN_OR_MORGANA' : 'EVIL_ALLY';
    return { playerId: p.playerId, seatNo: p.seatNo, nickname: p.nickname, knowledgeType,
      ...(knowledgeType === 'EVIL_ALLY' ? { roleCode: p.roleCode } : {}) };
  });
  function dispatch(action, expectedRevision = revision) {
    requireAction(!disposed, '体验已退出');
    requireAction(expectedRevision === revision, '操作已过期');
    const actor = action && member(action.actorId);
    requireAction(actor, '无效的玩家');
    switch (action.type) {
      case 'ADD_BOT': {
        phaseIs('WAITING'); requireAction(actor.me, '只有体验玩家可以添加机器人');
        const count = action.count == null ? 1 : action.count;
        requireAction(Number.isInteger(count) && count > 0 && players.length + count <= 5, '最多加入四名机器人');
        for (let i = 0; i < count; i++) {
          const id = players.length + 1;
          players.push({ playerId: id, seatNo: id, nickname: `机器人${id - 1}`, avatarUrl: '/assets/guest/default-avatar.svg', me: false, isBot: true });
        }
        break;
      }
      case 'START': {
        phaseIs('WAITING'); requireAction(actor.me && players.length === 5, '满五人后才能开始');
        const roles = Object.entries(ui.roleConfig(5)).flatMap(([code, n]) => Array(n).fill(code));
        for (let i = roles.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]];
        }
        players.forEach((p, i) => { p.roleCode = roles[i]; });
        leader = Math.floor(random() * 5) + 1; phase = 'ROLE_CONFIRM'; break;
      }
      case 'CONFIRM':
        phaseIs('ROLE_CONFIRM'); requireAction(!confirmed.includes(actor.playerId), '身份已经确认');
        confirmed.push(actor.playerId); if (confirmed.length === 5) phase = 'TEAM_BUILDING'; break;
      case 'TEAM':
        phaseIs('TEAM_BUILDING'); requireAction(actor.playerId === leader, '只有队长可以提交队伍');
        requireAction(Array.isArray(action.team) && action.team.length === rule.teamSizes[round - 1] &&
          new Set(action.team).size === action.team.length && action.team.every(id => member(id)), '任务队伍人数或成员不正确');
        team = action.team.slice().sort((a, b) => a - b); votes = {}; actions = {};
        proposals.push({ proposalId: proposals.length + 1, missionNo: round, proposalNo, leaderPlayerId: leader,
          leaderSeatNo: leader, leaderNickname: member(leader).nickname, teamPlayerIds: team.slice(), status: 'VOTING', votes: [] });
        phase = 'TEAM_VOTING'; break;
      case 'VOTE': {
        phaseIs('TEAM_VOTING'); requireAction(['APPROVE', 'REJECT'].includes(action.choice), '请选择赞成或反对');
        requireAction(!votes[actor.playerId], '不能重复表决'); votes[actor.playerId] = action.choice;
        if (Object.keys(votes).length === 5) {
          const approvals = Object.values(votes).filter(v => v === 'APPROVE').length;
          const proposal = proposals[proposals.length - 1];
          proposal.votes = players.map(p => ({ seatNo: p.seatNo, choice: votes[p.playerId] }));
          proposal.approveCount = approvals; proposal.rejectCount = 5 - approvals;
          proposal.status = approvals >= 3 ? 'APPROVED' : 'REJECTED';
          if (approvals >= 3) phase = 'MISSION_EXECUTING';
          else if (++rejections >= 5) finish('EVIL', 'FIVE_REJECTED_TEAMS');
          else { proposalNo++; nextLeader(); team = []; phase = 'TEAM_BUILDING'; }
        }
        break;
      }
      case 'MISSION':
        phaseIs('MISSION_EXECUTING'); requireAction(team.includes(actor.playerId), '你不在任务队伍中');
        requireAction(['SUCCESS', 'FAIL'].includes(action.choice), '请选择合法任务牌');
        requireAction(alignment(actor.roleCode) === 'EVIL' || action.choice === 'SUCCESS', '正义阵营只能提交成功');
        requireAction(!actions[actor.playerId], '不能重复提交任务'); actions[actor.playerId] = action.choice;
        if (Object.keys(actions).length === team.length) {
          const failCount = Object.values(actions).filter(v => v === 'FAIL').length;
          latestResult = { missionNo: round, successCount: team.length - failCount, failCount, status: failCount ? 'FAILED' : 'SUCCESS' };
          missions.push({ ...latestResult, approvedProposalId: proposals[proposals.length - 1].proposalId });
          if (failCount) evilScore++; else goodScore++;
          if (evilScore === 3) finish('EVIL', 'THREE_FAILED_MISSIONS');
          else if (goodScore === 3) phase = 'ASSASSINATION';
          else { round++; proposalNo = 1; rejections = 0; nextLeader(); team = []; phase = 'TEAM_BUILDING'; }
        }
        break;
      case 'EARLY_ASSASSINATION':
        requireAction(['TEAM_BUILDING', 'TEAM_VOTING', 'MISSION_EXECUTING'].includes(phase) && actor.roleCode === 'ASSASSIN', '当前不能发动提前刺杀');
        phase = 'ASSASSINATION'; break;
      case 'ASSASSINATE': {
        phaseIs('ASSASSINATION'); requireAction(actor.roleCode === 'ASSASSIN', '只有刺客可以刺杀');
        const target = member(action.targetId);
        requireAction(target && alignment(target.roleCode) === 'GOOD', '请选择公开的正义玩家');
        assassinationTarget = target.playerId;
        finish(target.roleCode === 'MERLIN' ? 'EVIL' : 'GOOD', target.roleCode === 'MERLIN' ? 'MERLIN_ASSASSINATED' : 'ASSASSINATION_MISSED'); break;
      }
      case 'END': requireAction(actor.me && !['WAITING', 'FINISHED'].includes(phase), '体验已经结束'); finish(null, 'HOST_ENDED'); break;
      default: throw new Error('未知操作');
    }
    revision++; return getView(1);
  }
  function getView(viewerId = 1) {
    const viewer = member(viewerId); requireAction(viewer, '无效的玩家');
    const publicPlayers = players.map(({ roleCode, ...p }) => p);
    const role = phase === 'WAITING' ? null : {
      roleCode: viewer.roleCode, roleName: ui.ROLE_NAMES[viewer.roleCode], alignmentCode: alignment(viewer.roleCode),
      alignmentName: alignment(viewer.roleCode) === 'GOOD' ? '正义阵营' : '邪恶阵营', instruction: ABILITIES[viewer.roleCode],
      confirmed: confirmed.includes(viewerId), visiblePlayers: visiblePlayers(viewer),
    };
    const revealed = ['ASSASSINATION', 'FINISHED'].includes(phase)
      ? players.filter(p => alignment(p.roleCode) === 'EVIL').map(p => ({ playerId: p.playerId, roleCode: p.roleCode })) : [];
    return copy({ revision, room: { players: publicPlayers, maxPlayers: 5, currentPlayers: players.length, myPlayerId: viewerId }, role,
      game: phase === 'WAITING' ? null : { gameId, phase, missionNo: round, proposalNo, consecutiveRejections: rejections,
        maxRejections: 5, leaderPlayerId: leader, requiredTeamSize: rule.teamSizes[round - 1], confirmedPlayerIds: confirmed,
        goodScore, evilScore, selectedPlayerIds: team, votedPlayerIds: Object.keys(votes).map(Number),
        missionSubmittedPlayerIds: Object.keys(actions).map(Number), hasVoted: !!votes[viewerId], hasSubmittedMission: !!actions[viewerId],
        onMission: team.includes(viewerId), evil: alignment(viewer.roleCode) === 'EVIL', assassin: viewer.roleCode === 'ASSASSIN',
        latestMissionResult: latestResult, winner, finishReason: reason, assassinationTargetPlayerId: assassinationTarget,
        revealedEvilIdentities: revealed, identities: phase === 'FINISHED' ? players.map(p => ({ ...p,
          roleName: ui.ROLE_NAMES[p.roleCode], alignment: alignment(p.roleCode) })) : [] },
      timeline: { proposals, missions } });
  }
  function botTurn() {
    if (disposed) return null;
    const bots = players.filter(p => p.isBot);
    let bot, type;
    if (phase === 'ROLE_CONFIRM') { bot = bots.find(p => !confirmed.includes(p.playerId)); type = 'CONFIRM'; }
    if (phase === 'TEAM_BUILDING') { bot = bots.find(p => p.playerId === leader); type = 'TEAM'; }
    if (phase === 'TEAM_VOTING') { bot = bots.find(p => !votes[p.playerId]); type = 'VOTE'; }
    if (phase === 'MISSION_EXECUTING') { bot = bots.find(p => team.includes(p.playerId) && !actions[p.playerId]); type = 'MISSION'; }
    if (phase === 'ASSASSINATION') { bot = bots.find(p => p.roleCode === 'ASSASSIN'); type = 'ASSASSINATE'; }
    if (!bot) return null;
    return copy({ actorId: bot.playerId, type, revision, context: { playerIds: ids(), teamSize: rule.teamSizes[round - 1],
      alignment: alignment(bot.roleCode), roleCode: bot.roleCode, visiblePlayers: visiblePlayers(bot),
      targetIds: phase === 'ASSASSINATION' ? players.filter(p => alignment(p.roleCode) === 'GOOD').map(p => p.playerId) : [] } });
  }
  return { dispatch, getView, botTurn, dispose() { disposed = true; }, isDisposed: () => disposed };
}
module.exports = { createGame };
