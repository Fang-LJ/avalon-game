package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GameActionPolicyTest {
    @Test void nonLeaderCannotSubmitTeam() { assertThrows(BusinessException.class, () -> GameActionPolicy.requireLeader(2, 1)); }
    @Test void wrongOrDuplicateTeamSizeIsRejected() {
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireTeamSize(List.of(1L,2L), 3));
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireTeamSize(List.of(1L,1L), 2));
    }
    @Test void nonMemberCannotExecuteMission() { assertThrows(BusinessException.class, () -> GameActionPolicy.requireMissionMember(3, List.of(1L,2L))); }
    @Test void goodCannotFailButEvilMayChooseEither() {
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireMissionChoice(Role.MERLIN, MissionChoice.FAIL));
        assertDoesNotThrow(() -> GameActionPolicy.requireMissionChoice(Role.MERLIN, MissionChoice.SUCCESS));
        assertDoesNotThrow(() -> GameActionPolicy.requireMissionChoice(Role.MORGANA, MissionChoice.FAIL));
    }
    @Test void operationsAfterGameEndAreRejectedByPhaseGuard() {
        assertThrows(BusinessException.class, () -> GameActionPolicy.requirePhase(Phase.FINISHED, Phase.TEAM_VOTING));
    }
    @Test void missionResultContractContainsCountsNotActorIdentity() {
        var components = List.of(GameService.MissionResult.class.getRecordComponents()).stream().map(c -> c.getName()).toList();
        assertEquals(List.of("missionNo", "successCount", "failCount", "status"), components);
    }
}
