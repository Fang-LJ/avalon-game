// Private device notes only. No API/request/socket dependency; never mutate a server DTO.
const { roleConfig, ROLE_MARKS, ROLE_NAMES } = require('./presentation');
const PHASES = Object.freeze(['TEAM_BUILDING', 'TEAM_VOTING', 'MISSION_EXECUTING', 'LADY_OF_LAKE']);
const EVIL = ['MORGANA', 'ASSASSIN', 'MINION', 'MORDRED', 'OBERON'];
const ORDINARY_EVIL = EVIL.filter(role => role !== 'OBERON');
const SIDE_MARKS = { GOOD_SIDE: ['蓝', 'blue'], EVIL_SIDE: ['红', 'evil'] };
const OPTION_ORDER = ['MERLIN', 'PERCIVAL', 'LOYAL_SERVANT', 'GOOD_SIDE', 'ASSASSIN',
  'MORGANA', 'MINION', 'MORDRED', 'OBERON', 'EVIL_SIDE'];
const isSide = code => Object.prototype.hasOwnProperty.call(SIDE_MARKS, code);
const idValid = id => Number.isSafeInteger(id) && id > 0;
const allowedPhase = phase => PHASES.includes(phase);
function storageKey(gameId, myPlayerId) {
  return idValid(gameId) && idValid(myPlayerId) ? `AVALON_ROLE_GUESSES_V1:${gameId}:${myPlayerId}` : '';
}
function validContext(c) {
  return !!c && idValid(c.viewerPlayerId) && roleConfig(c.playerCount)[c.viewerRole] > 0 &&
    Array.isArray(c.players) && c.players.some(p => p.playerId === c.viewerPlayerId);
}
function targetExists(c, id) { return idValid(id) && c.players.some(p => p.playerId === id && !p.empty); }
function knowledge(c, targetId) {
  if (targetId === c.viewerPlayerId) return { exactRole: c.viewerRole };
  const visible = (c.visiblePlayers || []).find(p => p.playerId === targetId);
  if (!visible) return {};
  if (ORDINARY_EVIL.includes(c.viewerRole) && visible.knowledgeType === 'EVIL_ALLY' &&
      ORDINARY_EVIL.includes(visible.roleCode) && roleConfig(c.playerCount)[visible.roleCode])
    return { exactRole: visible.roleCode };
  if (c.viewerRole === 'MERLIN' && visible.knowledgeType === 'EVIL') return { moon: true };
  if (c.viewerRole === 'PERCIVAL' && visible.knowledgeType === 'MERLIN_OR_MORGANA') return { pair: true };
  return {};
}
function percivalPair(c) {
  if (!validContext(c) || c.viewerRole !== 'PERCIVAL') return [];
  const ids = [...new Set((c.visiblePlayers || []).filter(p => p.knowledgeType === 'MERLIN_OR_MORGANA' &&
    p.playerId !== c.viewerPlayerId && targetExists(c, p.playerId)).map(p => p.playerId))].sort((a,b) => a-b);
  return ids.length === 2 ? ids : [];
}
function allowedRolesForTarget(c, targetId) {
  if (!validContext(c) || !targetExists(c, targetId) || knowledge(c, targetId).exactRole) return [];
  const roles = Object.keys(roleConfig(c.playerCount));
  if (c.viewerRole === 'MERLIN') return roles.filter(role => knowledge(c, targetId).moon
    ? EVIL.includes(role) && role !== 'MORDRED' : !EVIL.includes(role) || role === 'MORDRED');
  if (c.viewerRole === 'PERCIVAL') {
    const pair = percivalPair(c);
    if (!pair.length) return []; // Do not infer candidates from an incomplete private-role response.
    return roles.filter(role => pair.includes(targetId) ? ['MERLIN','MORGANA'].includes(role)
      : !['MERLIN','MORGANA'].includes(role));
  }
  return roles;
}
function possibleAlignmentsForTarget(c, targetId) {
  const allowed = allowedRolesForTarget(c, targetId);
  if (!allowed.length) return [];
  // Ordinary evil knows every non-Oberon evil ally. This is a visibility rule,
  // not a deduction from concrete notes or the remaining role inventory.
  const roles = ORDINARY_EVIL.includes(c.viewerRole)
    ? allowed.filter(role => !ORDINARY_EVIL.includes(role)) : allowed;
  return ['GOOD', 'EVIL'].filter(alignment => roles.some(role =>
    (EVIL.includes(role) ? 'EVIL' : 'GOOD') === alignment));
}
function sideCandidates(c, targetId) {
  const alignments = possibleAlignmentsForTarget(c, targetId);
  if (!alignments.length || percivalPair(c).includes(targetId) || knowledge(c, targetId).moon) return [];
  return alignments.map(alignment => alignment === 'GOOD' ? 'GOOD_SIDE' : 'EVIL_SIDE');
}
function baseCounts(c) {
  if (!validContext(c)) return {};
  const counts = roleConfig(c.playerCount);
  for (const id of new Set(c.players.map(p => p.playerId))) {
    const exact = knowledge(c, id).exactRole;
    if (exact) counts[exact] = Math.max(0, counts[exact] - 1);
  }
  // Reserve both slots for the ambiguous pair, without asserting which player is which.
  if (percivalPair(c).length) { counts.MERLIN = 0; counts.MORGANA = 0; }
  return counts;
}
function sanitizeGuesses(c, raw) {
  if (!validContext(c) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {}, counts = baseCounts(c), pair = percivalPair(c);
  if (pair.length && ((raw[pair[0]] === 'MERLIN' && raw[pair[1]] === 'MORGANA') ||
      (raw[pair[0]] === 'MORGANA' && raw[pair[1]] === 'MERLIN'))) {
    result[pair[0]] = raw[pair[0]]; result[pair[1]] = raw[pair[1]];
  }
  for (const key of Object.keys(raw).sort((a,b) => Number(a)-Number(b))) {
    const id = Number(key), role = raw[key];
    if (String(id) !== key || pair.includes(id) || !allowedRolesForTarget(c, id).includes(role) || !(counts[role] > 0)) continue;
    result[id] = role; counts[role]--;
  }
  // Side validity depends only on system knowledge, never on concrete-note counts.
  for (const key of Object.keys(raw)) {
    const id = Number(key), code = raw[key];
    if (String(id) !== key || !isSide(code) || pair.includes(id)) continue;
    if (sideCandidates(c, id).includes(code)) result[id] = code;
  }
  return result;
}
function remainingRoleCounts(c, guesses = {}, editingTargetId) {
  const counts = baseCounts(c), pair = percivalPair(c);
  for (const [id, role] of Object.entries(sanitizeGuesses(c, guesses)))
    if (!isSide(role) && Number(id) !== editingTargetId && !pair.includes(Number(id))) counts[role]--;
  return counts;
}
function guessCandidates(c, targetId, guesses = {}) {
  const roles = allowedRolesForTarget(c, targetId);
  if (percivalPair(c).includes(targetId)) return roles;
  const remaining = remainingRoleCounts(c, guesses, targetId);
  return roles.filter(role => remaining[role] > 0);
}
function markCandidates(c, targetId, guesses = {}) {
  return [...guessCandidates(c, targetId, guesses), ...sideCandidates(c, targetId)];
}
function applyGuess(c, guesses, targetId, role) {
  const next = sanitizeGuesses(c, guesses);
  if (!markCandidates(c, targetId, next).includes(role)) return next;
  const pair = percivalPair(c);
  if (pair.includes(targetId)) {
    const otherId = pair.find(id => id !== targetId);
    next[targetId] = role; next[otherId] = role === 'MERLIN' ? 'MORGANA' : 'MERLIN';
  } else next[targetId] = role;
  return sanitizeGuesses(c, next);
}
function clearGuess(c, guesses, targetId) {
  const next = sanitizeGuesses(c, guesses), pair = percivalPair(c);
  for (const id of pair.includes(targetId) ? pair : [targetId]) delete next[id];
  return next;
}
function displayIdentityMark(systemPlayer, role, phase) {
  const mark = isSide(role) ? SIDE_MARKS[role] : ROLE_MARKS[role];
  if (!allowedPhase(phase) || systemPlayer.me || systemPlayer.revealedEvil || systemPlayer.markType === 'ROLE' || !mark)
    return {};
  return { markType: 'GUESS', markText: mark[0], markClass: mark[1] };
}
function candidateOptions(roles) {
  return [...roles].sort((a,b) => OPTION_ORDER.indexOf(a) - OPTION_ORDER.indexOf(b)).map(roleCode => ({
    roleCode, name: roleCode === 'GOOD_SIDE' ? '蓝方' : roleCode === 'EVIL_SIDE' ? '红方' : ROLE_NAMES[roleCode],
    tone: EVIL.includes(roleCode) || roleCode === 'EVIL_SIDE' ? 'evil' : 'good',
  }));
}
function loadGuesses(key, c, storage) {
  if (!key) return {};
  try { const value = storage.getStorageSync(key); return sanitizeGuesses(c, value && value.guesses); }
  catch (_) { return {}; }
}
function saveGuesses(key, guesses, storage) {
  if (!key) return false;
  try {
    if (!Object.keys(guesses).length) storage.removeStorageSync(key);
    else storage.setStorageSync(key, { guesses: { ...guesses } });
    return true;
  } catch (_) { return false; }
}
function removeGuesses(key, storage) {
  if (!key) return;
  try { storage.removeStorageSync(key); } catch (_) { /* Phase render gate still hides every guess. */ }
}
module.exports = { allowedPhase, storageKey, knowledge, percivalPair, allowedRolesForTarget, remainingRoleCounts,
  possibleAlignmentsForTarget, sideCandidates,
  sanitizeGuesses, guessCandidates, markCandidates, applyGuess, clearGuess, displayIdentityMark, candidateOptions,
  loadGuesses, saveGuesses, removeGuesses };
