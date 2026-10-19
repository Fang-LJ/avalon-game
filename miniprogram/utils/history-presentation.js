const ui = require('./presentation');
// Own alignment drives copy and role colour; winner drives outcome, never role text.
function historyCard(game) {
  const base = ui.historyItem(game);
  const alignment = game.alignment;
  const valid = (game.winner === 'GOOD' || game.winner === 'EVIL') && (alignment === 'GOOD' || alignment === 'EVIL') && game.finishReason !== 'HOST_ENDED';
  const won = valid && alignment === game.winner;
  return { ...base, roleTone: alignment === 'GOOD' ? 'good' : alignment === 'EVIL' ? 'evil' : '',
    outcome: valid ? (won ? 'win' : 'loss') : 'neutral',
    outcomeText: valid ? `${alignment === 'GOOD' ? '正义' : '邪恶'}阵营${won ? '胜利' : '失败'}`
      : game.finishReason === 'HOST_ENDED' || !game.finishReason ? '房主结束 · 不计胜负' : `${base.reasonText} · 不计胜负` };
}
module.exports = { historyCard };
