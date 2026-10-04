// Anonymous public totals only. Never consume participant actions or ordering.
function normalizeResult(value) {
  if (!value || !Number.isInteger(value.missionNo) || value.missionNo < 1 || value.missionNo > 5 ||
      !Number.isInteger(value.successCount) || value.successCount < 0 ||
      !Number.isInteger(value.failCount) || value.failCount < 0 ||
      !['SUCCESS', 'FAILED'].includes(value.status)) return null;
  const count = value.successCount + value.failCount;
  if (count < 2 || count > 5) return null;
  return { missionNo: value.missionNo, successCount: value.successCount,
    failCount: value.failCount, status: value.status };
}

function resultCards(value) {
  const result = normalizeResult(value);
  if (!result) return [];
  return Array.from({ length: result.successCount + result.failCount }, (_, index) => ({
    index, type: index < result.successCount ? 'SUCCESS' : 'FAIL', flipped: false,
  }));
}

module.exports = { normalizeResult, resultCards, storageKey: gameId => `avalon:mission-result:${gameId}` };
