// Synthetic data only. This module is excluded from the game package.
function fixture(count = 8, phase = "TEAM_BUILDING") {
  const names = [
    "胖虎",
    "小王",
    "阿明",
    "方方",
    "小李",
    "小陈",
    "小吴",
    "琪琪",
    "阿九",
    "小十",
  ];
  const players = names
    .slice(0, count)
    .map((nickname, i) => ({
      playerId: i + 1,
      seatNo: i + 1,
      nickname,
      me: i === 0,
      host: i === 0,
      online: i !== 6,
    }));
  const room = {
    roomId: 101,
    roomCode: "123456",
    maxPlayers: count,
    currentPlayers: count,
    status: "PLAYING",
    currentGameId: 101,
    host: true,
    myPlayerId: 1,
    players,
    canStart: true,
  };
  const game = {
    gameId: 101,
    roomId: 101,
    phase,
    missionNo: 3,
    proposalNo: 1,
    consecutiveRejections: 1,
    goodScore: 1,
    evilScore: 1,
    leaderPlayerId: 1,
    leaderNickname: "胖虎",
    requiredTeamSize: 4,
    maxRejections: 5,
    confirmedCount: count - 1,
    playerCount: count,
    selectedPlayerIds: [1, 2, 3, 4],
    voteCount: count,
    hasVoted: false,
    hasSubmittedMission: false,
    onMission: true,
    evil: true,
    assassin: true,
    ladyEnabled: count === 10,
    ladyHolder: phase === "LADY_OF_LAKE",
    ladyHolderNickname: "胖虎",
    ladyEligibleTargetIds: [2, 3, 4, 5, 6],
    identities: [],
    latestVoteResult: {
      missionNo: 2,
      proposalNo: 1,
      approved: true,
      votes: players.map((p, i) => ({
        ...p,
        choice: i < 5 ? "APPROVE" : "REJECT",
      })),
    },
  };
  const role = {
    roleCode: "ASSASSIN",
    roleName: "刺客",
    alignmentCode: "EVIL",
    alignmentName: "邪恶",
    confirmed: false,
    instruction: "你知道邪恶同伴。正义完成三个任务后，由你刺杀梅林。",
    visiblePlayers: [{ ...players[3], hint: "邪恶同伴" }],
  };
  const proposals = Array.from({ length: 8 }, (_, i) => ({
    proposalId: i + 1,
    missionNo: Math.min(5, 1 + Math.floor(i / 2)),
    proposalNo: 1 + (i % 2),
    leaderPlayerId: 1 + (i % count),
    teamPlayerIds: [1, 2, 3],
    status: "APPROVED",
    votes: players.map((p, j) => ({
      ...p,
      choice: j < 5 ? "APPROVE" : "REJECT",
    })),
  }));
  const missions = Array.from({ length: 4 }, (_, i) => ({
    missionNo: i + 1,
    approvedProposalId: 1 + i * 2,
    successCount: i === 1 ? 2 : 3,
    failCount: i === 1 ? 1 : 0,
    status: i === 1 ? "FAIL" : "SUCCESS",
  }));
  const timeline = { gameId: 101, proposals, missions };
  const identities = players.map((p, i) => ({
    ...p,
    roleName:
      i === 0
        ? "刺客"
        : i === 1
          ? "梅林"
          : i === 2
            ? "派西维尔"
            : i === 3
              ? "莫甘娜"
              : "忠臣",
    alignment: i === 0 || i === 3 ? "EVIL" : "GOOD",
  }));
  if (phase === "FINISHED") {
    game.winner = "GOOD";
    game.goodScore = 3;
    game.identities = identities;
  }
  const replay = {
    gameId: 101,
    roomCode: "123456",
    playerCount: count,
    winner: "GOOD",
    finishReason: "ASSASSINATION_MISSED",
    assassinationTargetPlayerId: 5,
    players: identities,
    proposals,
    missions: missions.map((m) => ({
      mission: m,
      actions: [
        { gamePlayerId: 1, choice: "SUCCESS" },
        { gamePlayerId: 2, choice: "SUCCESS" },
        { gamePlayerId: 3, choice: m.failCount ? "FAIL" : "SUCCESS" },
      ],
    })),
    ladyActions: [
      {
        sequenceNo: 1,
        holderGamePlayerId: 1,
        targetGamePlayerId: 4,
        resultAlignment: "EVIL",
      },
    ],
  };
  const history = Array.from({ length: 25 }, (_, i) => ({
    gameId: 101 + i,
    playerCount: count,
    roleName: "刺客",
    winner: i % 2 ? "EVIL" : "GOOD",
    finishedAt: "2026-09-28T16:00:00",
    finishReason: "ASSASSINATION_MISSED",
  }));
  return {
    room,
    game,
    role,
    timeline,
    replay,
    history,
    profile: { userId: 1, nickname: "胖虎" },
    stats: {
      totalGames: 25,
      wins: 13,
      losses: 12,
      winRate: 52,
      goodGames: 10,
      evilGames: 15,
      roleCounts: [
        { roleName: "刺客", games: 15 },
        { roleName: "梅林", games: 10 },
      ],
    },
  };
}
module.exports = fixture;
