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
  HOST_ENDED: '房主结束对局 · 不计胜负',
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
    resultText: game.winner ? (game.winner === 'GOOD' ? '正义' : '邪恶') + '胜利' : '房主结束',
    reasonText: FINISH[game.finishReason] || game.finishReason,
  };
}
function seatPosition(seatNo, maxPlayers, formal = false) {
  const angle = -Math.PI / 2 + ((seatNo - 1) * 2 * Math.PI) / maxPlayers;
  const x = 50 + 42 * Math.cos(angle);
  const y = formal
    ? (maxPlayers >= 9 ? 39 + 36 * Math.sin(angle) : 37 + 34 * Math.sin(angle))
    : maxPlayers >= 9
      ? 41 + 39 * Math.sin(angle)
      : 38.5 + 36.5 * Math.sin(angle);
  return `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;`;
}
function privateKnowledge(player) {
  const type = player.knowledgeType;
  if (!type) return player;
  return {
    ...player,
    knowledgeSymbol: type === 'MERLIN_OR_MORGANA' ? '?' : '●',
    knowledgeClass:
      type === 'MERLIN_OR_MORGANA' ? 'knowledge-candidate' : 'knowledge-evil',
  };
}
function seats(players, selected = [], leaderId, maxPlayers = players.length, phase = 'TEAM_BUILDING') {
  const selectionClass = phase === 'ASSASSINATION' ? 'selected-danger'
    : phase === 'LADY_OF_LAKE' ? 'selected-lady' : 'selected-team';
  return players.filter((p) => p.seatNo != null).map((p) => {
    return {
      ...privateKnowledge(p),
      initial: initial(p.nickname),
      selected: selected.includes(p.playerId),
      selectionClass: selected.includes(p.playerId) ? selectionClass : '',
      leader: p.playerId === leaderId,
      position: seatPosition(p.seatNo, maxPlayers, true),
    };
  });
}
function lobbySeats(players, maxPlayers) {
  const bySeat = Object.fromEntries(
    players.filter((p) => p.seatNo != null).map((p) => [p.seatNo, p]),
  );
  return Array.from({ length: maxPlayers }, (_, index) => {
    const seatNo = index + 1;
    const player = bySeat[seatNo];
    return {
      ...(player || {
        playerId: `empty-${seatNo}`,
        nickname: '',
        avatarUrl: '',
        empty: true,
      }),
      seatNo,
      initial: player ? initial(player.nickname) : '+',
      position: seatPosition(seatNo, maxPlayers),
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
  seatPosition,
  privateKnowledge,
  seats,
  lobbySeats,
  logs,
  showRules,
  showLegal,
};
