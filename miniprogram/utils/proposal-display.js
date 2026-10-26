const { normalizeResult } = require('./mission-result');

// Presentation only: use public votes and anonymous mission totals, never actions.
function proposalDisplay(entry, players = [], maxPlayers = 10) {
  const count = Number.isInteger(maxPlayers) && maxPlayers >= 5 && maxPlayers <= 10 ? maxPlayers : 10;
  const resolved = entry.resolved !== false && ['APPROVED', 'REJECTED'].includes(entry.status);
  const bySeat = new Map(players.map(player => [player.seatNo, player]));
  const team = new Set(entry.teamPlayerIds || []);
  const leaderSeat = entry.leaderSeatNo ?? players.find(p => p.playerId === entry.leaderPlayerId)?.seatNo;
  const mission = resolved && entry.status === 'APPROVED' ? normalizeResult(entry.mission) : null;
  return {
    resultTone: resolved && entry.status === 'REJECTED' ? 'rejected'
      : mission ? (mission.status === 'SUCCESS' ? 'success' : 'failed') : 'pending',
    voteCells: Array.from({ length: count }, (_, index) => {
      const seatNo = index + 1, player = bySeat.get(seatNo);
      const vote = resolved && (entry.votes || []).find(v => v.seatNo === seatNo);
      return { seatNo, tone: vote?.choice === 'APPROVE' ? 'approve'
        : vote?.choice === 'REJECT' ? 'reject' : 'pending',
      selected: !!player && team.has(player.playerId), leader: leaderSeat === seatNo };
    }),
  };
}

module.exports = { proposalDisplay };
