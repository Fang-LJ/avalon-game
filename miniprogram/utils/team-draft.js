// Public proposal-scoped data only. Personal role guesses never enter this module.
const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
const scope = value => `${value.gameId}:${value.missionNo}:${value.proposalNo}:${value.leaderPlayerId}`;
const idsValid = ids => Array.isArray(ids) && ids.every(id=>Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
function normalize(value, game) {
  if (!value || !Number.isSafeInteger(value.gameId) || value.gameId <= 0 ||
      !Number.isInteger(value.missionNo) || value.missionNo < 1 || value.missionNo > 5 ||
      !Number.isInteger(value.proposalNo) || value.proposalNo < 1 || value.proposalNo > 5 ||
      !Number.isSafeInteger(value.leaderPlayerId) || value.leaderPlayerId <= 0 ||
      !Number.isInteger(game.requiredTeamSize) || game.requiredTeamSize < 1 || game.requiredTeamSize > 5 || game.phase !== 'TEAM_BUILDING' || scope(value) !== scope(game) ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 || !idsValid(value.selectedPlayerIds) ||
      value.selectedPlayerIds.length > game.requiredTeamSize || !idsValid(value.nominatedPlayerIds) ||
      typeof value.nominated !== 'boolean' || (value.nominated ? value.nominatedPlayerIds.length !== game.requiredTeamSize : value.nominatedPlayerIds.length !== 0)) return null;
  return { gameId:value.gameId, missionNo:value.missionNo, proposalNo:value.proposalNo, leaderPlayerId:value.leaderPlayerId,
    selectedPlayerIds:value.selectedPlayerIds.slice(), nominatedPlayerIds:value.nominatedPlayerIds.slice(), nominated:value.nominated, revision:value.revision };
}
function requestFor(draft, playerIds = draft.selectedPlayerIds) {
  return { playerIds:playerIds.slice(), missionNo:draft.missionNo, proposalNo:draft.proposalNo,
    leaderPlayerId:draft.leaderPlayerId, expectedRevision:draft.revision };
}
class DraftSync {
  constructor(draft, send, changed, requiredTeamSize) {
    this.requiredTeamSize=requiredTeamSize; this.draft=draft; this.send=send; this.changed=changed; this.intent=0; this.desired=null; this.promise=null; this.error=null; this.closed=false;
  }
  status() { return { draft:this.draft, selectedIds:(this.desired || this.draft.selectedPlayerIds).slice(), pending:!!this.desired || !!this.promise, error:this.error }; }
  notify() { if (!this.closed) this.changed(this.status()); }
  accept(draft, notify = true) {
    if (this.closed || scope(draft) !== scope(this.draft) || draft.revision < this.draft.revision) return false;
    this.draft=draft;
    // A timeout may have committed. A later snapshot/WS acknowledgement can resolve it safely.
    if (this.error && this.desired && sameIds(this.desired,draft.selectedPlayerIds)) { this.error=null; this.desired=null; }
    if (notify) this.notify(); return true;
  }
  select(ids) {
    if (this.closed) return;
    this.desired=ids.slice(); this.intent++; this.error=null; this.notify(); this.start();
  }
  start() {
    if (this.promise || this.closed || !this.desired || this.error) return;
    this.promise=this.drain().finally(()=>{this.promise=null; this.notify(); this.start();});
  }
  async drain() {
    try {
      while (!this.closed && this.desired) {
        const intent=this.intent, ids=this.desired.slice(), base=this.draft;
        const response=await this.send(requestFor(base,ids));
        if (this.closed) return;
        const next=normalize(response,{...base,phase:'TEAM_BUILDING',requiredTeamSize:this.requiredTeamSize});
        if (!next || response.revision <= base.revision) throw Error('无效的选人同步响应');
        this.accept(next,false);
        if (this.intent === intent) {
          if (!sameIds(this.draft.selectedPlayerIds,ids)) throw Error('选人已在其他设备更新，请重试');
          this.desired=null;
        }
        this.notify();
      }
    } catch (error) { if (!this.closed) { this.error=error; this.notify(); } }
  }
  async flush() {
    this.start(); while (this.promise) await this.promise;
    if (this.closed || this.error || this.desired) throw this.error || Error('选人尚未同步');
    return this.draft;
  }
  retry(draft) { const ids=this.desired && this.desired.slice(); this.accept(draft,false); this.error=null; if (ids && !sameIds(ids,this.draft.selectedPlayerIds)) this.desired=ids; this.notify(); this.start(); }
  close() { this.closed=true; this.desired=null; }
}
module.exports = { scope, sameIds, normalize, requestFor, DraftSync };
