package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.game.AvalonRepository.MissionRow;
import com.avalon.game.game.AvalonRepository.PlayerRow;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GameServiceStateMachineTest {
    private AvalonRepository repository;
    private RoomService roomService;
    private RoomEventPublisher events;
    private GameService service;
    private final List<PlayerRow> players = java.util.stream.IntStream.rangeClosed(1, 5)
            .mapToObj(seat -> new PlayerRow(100 + seat, 1, 200 + seat, "P" + seat, seat, seat == 1, true)).toList();

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        roomService = mock(RoomService.class);
        events = mock(RoomEventPublisher.class);
        service = spy(new GameService(repository, roomService, new RoleVisibilityService(), events));
        doReturn(null).when(service).state(202, 50);
    }

    @Test void lastMissionActionAutomaticallyScoresAdvancesAndRotatesLeader() {
        prepareMission(new GameRow(50, 1, 1, 101, null, 1, 0, 0, 0, Phase.MISSION_EXECUTING, null), 0);

        service.mission(202, 50, MissionChoice.SUCCESS);

        verify(repository).completeMission(70, 1, 0, false);
        verify(repository).advanceAfterMission(50, 1, 0, 2, 102);
        verify(events).publish(1, "ROUND_CHANGED");
    }

    @Test void thirdFailedMissionFinishesImmediatelyWithoutLadyOrNextRound() {
        prepareMission(new GameRow(50, 1, 3, 101, null, 1, 0, 0, 2, Phase.MISSION_EXECUTING, null), 1);

        service.mission(202, 50, MissionChoice.FAIL);

        verify(repository).finish(50, Winner.EVIL, "THREE_FAILED_MISSIONS");
        verify(repository, never()).advanceAfterMission(anyLong(), anyInt(), anyInt(), anyInt(), anyLong());
        verify(events, never()).publish(1, "LADY_OF_LAKE_STARTED");
    }

    @Test void thirdSuccessfulMissionEntersAssassination() {
        prepareMission(new GameRow(50, 1, 3, 101, null, 1, 0, 2, 0, Phase.MISSION_EXECUTING, null), 0);

        service.mission(202, 50, MissionChoice.SUCCESS);

        verify(repository).applyMissionScore(50, 3, 0, Phase.ASSASSINATION);
        verify(events).publish(1, "ASSASSINATION_STARTED");
    }

    @Test void fifthConsecutiveRejectedTeamFinishesForEvil() {
        GameRow game = new GameRow(50, 1, 2, 101, null, 5, 4, 1, 0, Phase.TEAM_VOTING, null);
        MissionRow mission = new MissionRow(70, 50, 2, 5, 101, "101,102,103", 3, 1, "VOTING", null, null);
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(1, 202)).thenReturn(players.get(1));
        when(repository.currentMission(50, 2, 5)).thenReturn(Optional.of(mission));
        when(repository.players(1)).thenReturn(players);
        when(repository.voteCount(70)).thenReturn(5);
        when(repository.approveCount(70)).thenReturn(2);

        service.vote(202, 50, VoteChoice.REJECT);

        verify(repository).finish(50, Winner.EVIL, "FIVE_REJECTED_TEAMS");
        verify(repository, never()).updateAfterRejectedTeam(anyLong(), anyInt(), anyInt(), anyLong());
    }

    @Test void duplicateTeamVoteIsRejected() {
        GameRow game = new GameRow(50, 1, 2, 101, null, 1, 0, 0, 0, Phase.TEAM_VOTING, null);
        MissionRow mission = new MissionRow(70, 50, 2, 1, 101, "101,102,103", 3, 1, "VOTING", null, null);
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(1, 202)).thenReturn(players.get(1));
        when(repository.currentMission(50, 2, 1)).thenReturn(Optional.of(mission));
        doThrow(new DuplicateKeyException("duplicate")).when(repository)
                .insertVote(50, 70, 2, 1, 102, VoteChoice.APPROVE);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.vote(202, 50, VoteChoice.APPROVE));
        assertEquals("DUPLICATE_ACTION", error.getCode());
    }

    @Test void duplicateMissionActionIsRejected() {
        GameRow game = new GameRow(50, 1, 1, 101, null, 1, 0, 0, 0, Phase.MISSION_EXECUTING, null);
        MissionRow mission = new MissionRow(70, 50, 1, 1, 101, "102", 1, 1, "EXECUTING", null, null);
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(1, 202)).thenReturn(players.get(1));
        when(repository.currentMission(50, 1, 1)).thenReturn(Optional.of(mission));
        when(repository.gamePlayer(50, 102)).thenReturn(Optional.of(
                new GamePlayerRow(1, 50, 102, Role.LOYAL_SERVANT, Alignment.GOOD, true)));
        doThrow(new DuplicateKeyException("duplicate")).when(repository)
                .insertMissionAction(70, 102, MissionChoice.SUCCESS);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.mission(202, 50, MissionChoice.SUCCESS));
        assertEquals("DUPLICATE_ACTION", error.getCode());
    }

    private void prepareMission(GameRow game, int failCount) {
        MissionRow mission = new MissionRow(70, 50, game.missionNo(), game.proposalNo(), 101, "102", 1, 1, "EXECUTING", null, null);
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(1, 202)).thenReturn(players.get(1));
        when(repository.currentMission(50, game.missionNo(), game.proposalNo())).thenReturn(Optional.of(mission));
        Role role = failCount == 0 ? Role.LOYAL_SERVANT : Role.MORGANA;
        when(repository.gamePlayer(50, 102)).thenReturn(Optional.of(new GamePlayerRow(1, 50, 102, role, role.alignment(), true)));
        when(repository.actionCount(70)).thenReturn(1);
        when(repository.failCount(70)).thenReturn(failCount);
        when(repository.players(1)).thenReturn(players);
        when(repository.playerById(101)).thenReturn(Optional.of(players.getFirst()));
    }
}
