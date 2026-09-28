const ROLE_NAMES = {
  MERLIN: '梅林',
  PERCIVAL: '派西维尔',
  LOYAL_SERVANT: '忠臣',
  MORGANA: '莫甘娜',
  ASSASSIN: '刺客',
  MINION: '爪牙',
  MORDRED: '莫德雷德',
  OBERON: '奥伯伦',
};
const FINISH = {
  FIVE_REJECTED_TEAMS: '连续五次组队被否决',
  THREE_FAILED_MISSIONS: '三个任务失败',
  MERLIN_ASSASSINATED: '刺客刺中梅林',
  ASSASSINATION_MISSED: '刺客刺杀失败 · 梅林存活',
};
const TEAMS = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};
function rules(n) {
  const good = { 5: 3, 6: 4, 7: 4, 8: 5, 9: 6, 10: 6 }[n];
  const extra = {
    5: [],
    6: [],
    7: ['奥伯伦'],
    8: ['爪牙'],
    9: ['莫德雷德'],
    10: ['莫德雷德', '奥伯伦'],
  }[n];
  return {
    good,
    evil: n - good,
    goodRoles: '梅林 · 派西维尔 · 忠臣 × ' + (good - 2),
    evilRoles: ['莫甘娜', '刺客'].concat(extra).join(' · '),
    teamText: TEAMS[n].join(' / '),
    fourth: n >= 7 ? 2 : 1,
    lady: n === 10,
  };
}
function initial(name) {
  return Array.from(name || '玩家')[0];
}
function dateText(value) {
  return value ? value.replace('T', ' ').slice(0, 16) : '';
}
function historyItem(game) {
  return {
    ...game,
    timeText: dateText(game.finishedAt),
    resultText: (game.winner === 'GOOD' ? '正义' : '邪恶') + '胜利',
    reasonText: FINISH[game.finishReason] || game.finishReason,
  };
}
function seats(players, selected = [], leaderId) {
  const n = players.length;
  // Reserve the bottom quarter for names and badges, not just avatar bounds.
  const eight = [
    [11, 9],
    [50, 2],
    [89, 9],
    [92, 39],
    [89, 68],
    [50, 75],
    [11, 68],
    [8, 39],
  ];
  return players.map((p, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const [x, y] =
      n === 8
        ? eight[i]
        : [
            50 + 42 * Math.cos(angle),
            n >= 9 ? 41 + 39 * Math.sin(angle) : 38.5 + 36.5 * Math.sin(angle),
          ];
    return {
      ...p,
      initial: initial(p.nickname),
      selected: selected.includes(p.playerId),
      leader: p.playerId === leaderId,
      position: `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;`,
    };
  });
}
function logs(timeline, players, replay = false) {
  const byId = Object.fromEntries(players.map((p) => [p.playerId, p]));
  const label = (id) =>
    byId[id] ? `${byId[id].seatNo} ${byId[id].nickname}` : String(id);
  return (timeline.proposals || []).map((p) => {
    const bundle = (timeline.missions || []).find(
      (m) => (m.mission || m).approvedProposalId === p.proposalId,
    );
    const mission = bundle && (bundle.mission || bundle);
    const lady =
      replay &&
      mission &&
      (timeline.ladyActions || []).find(
        (a) => a.sequenceNo + 1 === mission.missionNo,
      );
    return {
      ...p,
      teamText: p.teamPlayerIds.map(label).join(' · '),
      resolved: p.status !== 'VOTING',
      approveText: p.votes
        .filter((v) => v.choice === 'APPROVE')
        .map((v) => v.seatNo)
        .join(' '),
      rejectText: p.votes
        .filter((v) => v.choice === 'REJECT')
        .map((v) => v.seatNo)
        .join(' '),
      statusText: {
        VOTING: '等待全员投票',
        APPROVED: '组队通过',
        REJECTED: '组队否决',
      }[p.status],
      mission,
      actions:
        replay && bundle
          ? (bundle.actions || []).map((a) => ({
              ...a,
              playerText:
                label(a.gamePlayerId) +
                '（' +
                (byId[a.gamePlayerId]?.roleName || '') +
                '）',
            }))
          : [],
      ladyText: lady
        ? label(lady.holderGamePlayerId) +
          ' → ' +
          label(lady.targetGamePlayerId) +
          '：' +
          lady.resultAlignment
        : '',
    };
  });
}
function showRules() {
  wx.showModal({
    title: '规则与角色说明',
    content:
      '5–10 人 · 后端自动裁定。队长选人，全员严格过半通过后执行任务；正义只能出成功，邪恶可出成功或失败。三个失败或连续五次否决：邪恶获胜。三个成功后刺客刺杀梅林决定胜负。7 人以上第 4 任务需 2 张失败票。仅 10 人局在第 2/3/4 任务后使用湖中仙女。梅林看不到莫德雷德；派西维尔看到梅林/莫甘娜；奥伯伦与邪恶同伴互不可见。',
    showCancel: false,
  });
}
function showLegal() {
  wx.showModal({
    title: '用户协议与隐私说明',
    content:
      '本应用使用微信登录标识识别账号，保存昵称和对局记录。进行中的角色、任务出票及湖中仙女结果仅按游戏规则私密展示；对局结束后，本局参与者可查看包含个人出票的完整复盘。正式上线前请以运营方公布的用户协议及微信隐私保护指引为准。',
    showCancel: false,
  });
}
module.exports = {
  ROLE_NAMES,
  FINISH,
  rules,
  initial,
  dateText,
  historyItem,
  seats,
  logs,
  showRules,
  showLegal,
};
