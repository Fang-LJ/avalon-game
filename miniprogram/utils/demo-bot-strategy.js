// Receives only the actor's private view and public information, never engine state.
function chooseAction(turn, random = Math.random) {
  if (!turn) return null;
  const { actorId, type, context: c } = turn;
  const pick = values => values[Math.floor(random() * values.length)];
  switch (type) {
    case 'CONFIRM': return { type, actorId };
    case 'TEAM': {
      const pool = c.playerIds.filter(id => id !== actorId), team = [actorId];
      while (team.length < c.teamSize) {
        const id = pick(pool); team.push(id); pool.splice(pool.indexOf(id), 1);
      }
      return { type, actorId, team };
    }
    case 'VOTE': return { type, actorId, choice: random() < .7 ? 'APPROVE' : 'REJECT' };
    case 'MISSION': return { type, actorId, choice: c.alignment === 'EVIL' && random() < .7 ? 'FAIL' : 'SUCCESS' };
    case 'ASSASSINATE': return c.targetIds.length ? { type, actorId, targetId: pick(c.targetIds) } : null;
    default: return null;
  }
}
module.exports = { chooseAction };
