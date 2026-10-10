package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

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
        assertDoesNotThrow(() -> GameActionPolicy.requireMissionChoice(Role.MORGANA, MissionChoice.SUCCESS));
    }
    @Test void operationsAfterGameEndAreRejectedByPhaseGuard() {
        assertThrows(BusinessException.class, () -> GameActionPolicy.requirePhase(Phase.FINISHED, Phase.TEAM_VOTING));
    }
    @Test void missionResultContractContainsCountsNotActorIdentity() {
        var components = List.of(GameService.MissionResult.class.getRecordComponents()).stream().map(c -> c.getName()).toList();
        assertEquals(List.of("missionNo", "successCount", "failCount", "status"), components);
    }
    @Test void onlyCurrentLadyHolderCanAct() {
        assertDoesNotThrow(() -> GameActionPolicy.requireLadyHolder(4, 4L));
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireLadyHolder(3, 4L));
    }
    @Test void ladyCannotInspectSelfOutsiderOrHistoricalHolder() {
        Set<Long> history = Set.of(2L);
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireLadyTarget(3, 3, List.of(1L,2L,3L,4L), history));
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireLadyTarget(3, 9, List.of(1L,2L,3L,4L), history));
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireLadyTarget(3, 2, List.of(1L,2L,3L,4L), history));
        assertDoesNotThrow(() -> GameActionPolicy.requireLadyTarget(3, 4, List.of(1L,2L,3L,4L), history));
    }
    @Test void restartRequiresTheOriginalRoomSize() {
        assertThrows(BusinessException.class, () -> GameActionPolicy.requireRestartPlayerCount(9, 10));
        assertDoesNotThrow(() -> GameActionPolicy.requireRestartPlayerCount(10, 10));
    }
    @Test void ladyPrivateResultContainsOnlyAlignmentNotRoleAndPublicStateDoesNotContainTheResult() {
        var privateFields = Arrays.stream(GameService.LadyInspectionResult.class.getRecordComponents()).map(c -> c.getName()).toList();
        assertEquals(List.of("targetPlayerId", "targetSeatNo", "targetNickname", "alignment"), privateFields);
        var publicFields = Arrays.stream(GameService.GameState.class.getRecordComponents()).map(c -> c.getName().toLowerCase()).toList();
        assertFalse(publicFields.stream().anyMatch(name -> name.contains("ladyresult") || name.contains("inspectionresult")));
    }
    @Test void publicMissionAndWebSocketContractsCannotExposeSecretActorsOrLadyResults() {
        var missionFields = Arrays.stream(GameService.MissionResult.class.getRecordComponents()).map(c -> c.getName()).toList();
        assertEquals(List.of("missionNo", "successCount", "failCount", "status"), missionFields);
        var eventFields = Arrays.stream(RoomEventPublisher.RoomEvent.class.getRecordComponents()).map(c -> c.getName()).toList();
        assertEquals(List.of("roomId", "type"), eventFields);
        var stateFields = Arrays.stream(GameService.GameState.class.getRecordComponents()).map(c -> c.getName()).toList();
        assertFalse(stateFields.contains("roleCode"));
        assertFalse(stateFields.contains("roleName"));
        assertFalse(stateFields.contains("knowledgeType"));
        for (var contract : List.of(com.avalon.game.room.RoomService.PlayerView.class,
                GameHistoryService.Timeline.class, GameHistoryService.PublicProposal.class, RoomEventPublisher.RoomEvent.class)) {
            var fields = Arrays.stream(contract.getRecordComponents()).map(c -> c.getName()).toList();
            for (var forbidden : List.of("roleCode", "roleName", "role", "alignment", "knowledgeType", "visiblePlayers"))
                assertFalse(fields.contains(forbidden), contract.getSimpleName() + ": " + forbidden);
        }
        assertFalse(stateFields.contains("missionActions"));
        assertFalse(stateFields.contains("ladyInspectionResult"));
    }
}
