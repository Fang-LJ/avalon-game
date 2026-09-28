const ROLE_NAMES = {
  MERLIN: "梅林",
  PERCIVAL: "派西维尔",
  LOYAL_SERVANT: "忠臣",
  MORGANA: "莫甘娜",
  ASSASSIN: "刺客",
  MINION: "爪牙",
  MORDRED: "莫德雷德",
  OBERON: "奥伯伦",
};
const FINISH = {
  FIVE_REJECTED_TEAMS: "连续五次组队被否决",
  THREE_FAILED_MISSIONS: "三个任务失败",
  MERLIN_ASSASSINATED: "刺客刺中梅林",
  ASSASSINATION_MISSED: "刺客刺杀失败 · 梅林存活",
};
function rules(n) {
  const good = { 5: 3, 6: 4, 7: 4, 8: 5, 9: 6, 10: 6 }[n];
  const extra = {
    5: [],
    6: [],
    7: ["奥伯伦"],
    8: ["爪牙"],
    9: ["莫德雷德"],
    10: ["莫德雷德", "奥伯伦"],
  }[n];
  return {
    good,
    evil: n - good,
    goodRoles: "梅林 · 派西维尔 · 忠臣 × " + (good - 2),
    evilRoles: ["莫甘娜", "刺客"].concat(extra).join(" · "),
    teams:
      n === 5
        ? [2, 3, 2, 3, 3]
        : n === 6
          ? [2, 3, 4, 3, 4]
          : n === 7
            ? [2, 3, 3, 4, 4]
            : [3, 4, 4, 5, 5],
    fourth: n >= 7 ? 2 : 1,
    lady: n === 10,
  };
}
function permissions(g = {}, room = {}, role = {}) {
  return {
    team: g.phase === "TEAM_BUILDING" && g.leaderPlayerId === room.myPlayerId,
    vote: g.phase === "TEAM_VOTING" && !g.hasVoted,
    success:
      g.phase === "MISSION_EXECUTING" && g.onMission && !g.hasSubmittedMission,
    fail:
      g.phase === "MISSION_EXECUTING" &&
      g.onMission &&
      !g.hasSubmittedMission &&
      g.evil,
    lady: g.phase === "LADY_OF_LAKE" && g.ladyHolder,
    assassinate: g.phase === "ASSASSINATION" && g.assassin,
    confirm: g.phase === "ROLE_CONFIRM" && !role.confirmed,
    restart: g.phase === "FINISHED" && room.host,
  };
}
const phaseName = {
  ROLE_CONFIRM: "身份揭晓",
  TEAM_BUILDING: "队长选人",
  TEAM_VOTING: "组队投票",
  MISSION_EXECUTING: "秘密任务",
  LADY_OF_LAKE: "湖中仙女",
  ASSASSINATION: "刺杀梅林",
  FINISHED: "游戏结束",
  MISSION_RESULT: "同步任务结果",
};
function sceneFor(g) {
  return !g ? "Lobby" : g.phase === "ROLE_CONFIRM" ? "RoleReveal" : "Game";
}
function historyItem(g) {
  return {
    gameId: g.gameId,
    title: g.playerCount + " 人局 · " + g.roleName,
    result: (g.winner === "GOOD" ? "正义" : "邪恶") + "胜利",
    good: g.winner === "GOOD",
    date: (g.finishedAt || "").replace("T", " ").slice(0, 16),
  };
}
// Explicit projection: never spread backend objects into the public timeline.
function logs(data = {}, players = [], replay = false) {
  const byId = Object.fromEntries(
    players.map((p) => [p.playerId || p.gamePlayerId || p.id, p]),
  );
  const label = (id) =>
    byId[id] ? byId[id].seatNo + " " + byId[id].nickname : String(id);
  return (data.proposals || []).map((p) => {
    const bundle = (data.missions || []).find(
      (m) => (m.mission || m).approvedProposalId === p.proposalId,
    );
    const mission = bundle && (bundle.mission || bundle);
    const lines = [
      "队长：" + label(p.leaderPlayerId),
      "队伍：" + (p.teamPlayerIds || []).map(label).join(" / "),
    ];
    if (p.status === "VOTING") lines.push("等待全员投票");
    else
      for (const [choice, text] of [
        ["APPROVE", "同意"],
        ["REJECT", "反对"],
      ])
        lines.push(
          text +
            "：" +
            (p.votes || [])
              .filter((v) => v.choice === choice)
              .map((v) => v.seatNo)
              .join(" "),
        );
    if (mission)
      lines.push(
        "任务：SUCCESS × " +
          mission.successCount +
          " / FAIL × " +
          mission.failCount,
      );
    if (replay && bundle)
      for (const a of bundle.actions || [])
        lines.push(
          label(a.gamePlayerId) +
            "（" +
            (byId[a.gamePlayerId]?.roleName || "") +
            "）→ " +
            a.choice,
        );
    if (replay && mission)
      for (const a of data.ladyActions || [])
        if (a.sequenceNo + 1 === mission.missionNo)
          lines.push(
            "湖中仙女：" +
              label(a.holderGamePlayerId) +
              " → " +
              label(a.targetGamePlayerId) +
              "：" +
              a.resultAlignment,
          );
    return {
      title: "第 " + p.missionNo + " 轮 · 第 " + p.proposalNo + " 次提案",
      lines,
    };
  });
}
const RULE_TEXT =
  "5–10 人 · 队长选人，全员严格过半通过后执行任务。正义只能出成功，邪恶可出成功或失败。三个任务失败或连续五次否决：邪恶获胜。三个成功后刺客刺杀梅林。7 人以上第 4 任务需 2 张失败。仅 10 人局第 2/3/4 任务后使用湖中仙女。梅林看不到莫德雷德；奥伯伦与邪恶同伴互不可见。";
const LEGAL_TEXT =
  "使用微信登录标识识别账号，保存昵称与对局记录。进行中的秘密仅按规则展示；结束后本局参与者可查看完整复盘。本版本为开发测试版本，正式上线前须完成运营方用户协议与隐私保护指引。";
module.exports = {
  ROLE_NAMES,
  FINISH,
  rules,
  permissions,
  phaseName,
  sceneFor,
  historyItem,
  logs,
  RULE_TEXT,
  LEGAL_TEXT,
};
