package com.avalon.game.game;

import java.util.List;

/** Public, proposal-scoped UI state. Contains no role, vision or personal notes. */
public record TeamDraft(long gameId, int missionNo, int proposalNo, long leaderPlayerId,
                        List<Long> selectedPlayerIds, List<Long> nominatedPlayerIds,
                        boolean nominated, long revision) {
    public TeamDraft {
        selectedPlayerIds = List.copyOf(selectedPlayerIds);
        nominatedPlayerIds = List.copyOf(nominatedPlayerIds);
    }
    boolean matches(AvalonRepository.GameRow game) {
        return gameId == game.id() && missionNo == game.missionNo() && proposalNo == game.proposalNo()
                && Long.valueOf(leaderPlayerId).equals(game.leaderGamePlayerId());
    }
    static TeamDraft empty(AvalonRepository.GameRow game) {
        return new TeamDraft(game.id(), game.missionNo(), game.proposalNo(), game.leaderGamePlayerId(),
                List.of(), List.of(), false, 0);
    }
}
