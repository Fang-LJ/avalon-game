package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameServiceStateMachineTest {
    private AvalonRepository repository;
    private RoomService roomService;
    private RoomEventPublisher events;
    private GameService service;
    private final List<GamePlayerRow> players = java.util.stream.IntStream.rangeClosed(1, 5)
            .mapToObj(seat -> player(100 + seat, 200 + seat, seat, Role.LOYAL_SERVANT)).toList();

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        roomService = mock(RoomService.class);
        events = mock(RoomEventPublisher.class);
        service = spy(new GameService(repository, roomService, new RoleVisibilityService(), events));
        doReturn(null).when(service).state(anyLong(), anyLong());
    }

    @Test void lastMissionActionAutomaticallyPersistsResultAndAdvancesRound() {
        prepareMission(game(1, 0, 0, Phase.MISSION_EXECUTING), 0);

        service.mission(202, 50, MissionChoice.SUCCESS);

        verify(repository).insertMissionAction(70, 102, MissionChoice.SUCCESS);
        verify(repository).completeMission(70, 1, 0, false);
        verify(repository).advanceAfterMission(50, 1, 0, 2, 102);
        verify(events).publish(50, "ROUND_CHANGED");
    }

    @Test void fullWaitingLobbyStartsByUpdatingTheSameGameAndPlayers() {
        GameRow waiting = new GameRow(50, "123456", 201, 5, "AVALON_V1", "WAITING", null,
                1, 1, null, 0, 0, 0, null, null, null, null, null, null, null);
        when(roomService.requireRoom(50, true)).thenReturn(waiting);
        when(repository.players(50)).thenReturn(players);

        service.start(201, 50);

        verify(repository, times(5)).assignRole(eq(50L), anyLong(), any(Role.class));
        verify(repository).startGame(eq(50L), anyLong(), isNull());
        verify(repository, never()).insertWaitingGame(anyString(), anyLong(), anyInt());
    }

    @Test void thirdFailedMissionFinishesImmediately() {
        prepareMission(game(3, 0, 2, Phase.MISSION_EXECUTING), 1);

        service.mission(202, 50, MissionChoice.FAIL);

        verify(repository).finish(50, Winner.EVIL, "THREE_FAILED_MISSIONS", null);
        verify(repository, never()).advanceAfterMission(anyLong(), anyInt(), anyInt(), anyInt(), anyLong());
        verify(events, never()).publish(50, "LADY_OF_LAKE_STARTED");
    }

    @Test void thirdSuccessfulMissionEntersAssassination() {
        prepareMission(game(3, 2, 0, Phase.MISSION_EXECUTING), 0);

        service.mission(202, 50, MissionChoice.SUCCESS);

        verify(repository).applyMissionScore(50, 3, 0, Phase.ASSASSINATION);
        verify(events).publish(50, "ASSASSINATION_STARTED");
    }

    @Test void fifthRejectedProposalIsPersistedThenFinishesForEvil() {
        GameRow game = game(2, 0, 0, Phase.TEAM_VOTING, 5, 4);
        ProposalRow proposal = new ProposalRow(60, 50, 2, 5, 101, List.of(101L, 102L, 103L), "VOTING", 0, 0);
        prepareContext(game, players.get(1));
        when(repository.currentProposal(50, 2, 5)).thenReturn(Optional.of(proposal));
        when(repository.players(50)).thenReturn(players);
        when(repository.voteCount(60)).thenReturn(5);
        when(repository.approveCount(60)).thenReturn(2);

        service.vote(202, 50, VoteChoice.REJECT);

        verify(repository).resolveProposal(60, false, 2, 3);
        verify(repository).finish(50, Winner.EVIL, "FIVE_REJECTED_TEAMS", null);
        verify(repository, never()).updateAfterRejectedTeam(anyLong(), anyInt(), anyInt(), anyLong());
    }

    @Test void approvedProposalCreatesOneMissionReferencingTheProposal() {
        GameRow game = game(1, 0, 0, Phase.TEAM_VOTING);
        ProposalRow proposal = new ProposalRow(60, 50, 1, 1, 101, List.of(101L, 102L), "VOTING", 0, 0);
        prepareContext(game, players.get(1));
        when(repository.currentProposal(50, 1, 1)).thenReturn(Optional.of(proposal));
        when(repository.players(50)).thenReturn(players);
        when(repository.voteCount(60)).thenReturn(5);
        when(repository.approveCount(60)).thenReturn(3);

        service.vote(202, 50, VoteChoice.APPROVE);

        verify(repository).resolveProposal(60, true, 3, 2);
        verify(repository).insertMission(50, 1, 60, 2, 1);
        verify(repository).setPhase(50, Phase.MISSION_EXECUTING);
    }

    @Test void duplicateVoteAndMissionActionAreRejected() {
        GameRow voting = game(1, 0, 0, Phase.TEAM_VOTING);
        ProposalRow proposal = new ProposalRow(60, 50, 1, 1, 101, List.of(101L, 102L), "VOTING", 0, 0);
        prepareContext(voting, players.get(1));
        when(repository.currentProposal(50, 1, 1)).thenReturn(Optional.of(proposal));
        doThrow(new DuplicateKeyException("duplicate")).when(repository).insertVote(60, 102, VoteChoice.APPROVE);
        assertEquals("DUPLICATE_ACTION", assertThrows(BusinessException.class,
                () -> service.vote(202, 50, VoteChoice.APPROVE)).getCode());

        GameRow executing = game(1, 0, 0, Phase.MISSION_EXECUTING);
        prepareContext(executing, players.get(1));
        MissionRow mission = new MissionRow(70, 50, 1, 60, 2, 1, null, null, "EXECUTING");
        when(repository.currentMission(50, 1)).thenReturn(Optional.of(mission));
        when(repository.proposal(60)).thenReturn(Optional.of(proposal));
        doThrow(new DuplicateKeyException("duplicate")).when(repository).insertMissionAction(70, 102, MissionChoice.SUCCESS);
        assertEquals("DUPLICATE_ACTION", assertThrows(BusinessException.class,
                () -> service.mission(202, 50, MissionChoice.SUCCESS)).getCode());
    }

    @Test void restartCreatesNewGameAndCopiesPlayersWithoutMutatingOldGame() {
        GameRow finished = game(5, 3, 2, Phase.FINISHED);
        prepareContext(finished, players.getFirst());
        when(repository.players(50)).thenReturn(players);
        when(repository.insertWaitingGame("123456", 201, 5)).thenReturn(90L);
        GameRow replacement = new GameRow(90, "123456", 201, 5, "AVALON_V1", "WAITING", null,
                1, 1, null, 0, 0, 0, null, null, null, null, null, null, null);
        when(repository.game(90, true)).thenReturn(Optional.of(replacement));
        List<GamePlayerRow> copied = players.stream()
                .map(p -> new GamePlayerRow(p.id() + 100, 90, p.userId(), p.seatNo(), p.nickname(), null, null, false, true, null)).toList();
        when(repository.players(90)).thenReturn(copied);
        doReturn(null).when(service).state(201, 90);

        service.restart(201, 50);

        verify(repository).insertWaitingGame("123456", 201, 5);
        for (GamePlayerRow p : players) verify(repository).insertGamePlayer(90, p.userId(), p.nickname(), p.seatNo());
        verify(repository, never()).closeGame(50);
        verify(repository, never()).deleteGamePlayer(anyLong());
        verify(repository, times(5)).assignRole(eq(90L), anyLong(), any(Role.class));
        verify(repository).startGame(eq(90L), anyLong(), isNull());
    }

    @Test void assassinationPersistsTheSelectedTargetOnGame() {
        GameRow assassination = game(4, 3, 0, Phase.ASSASSINATION);
        GamePlayerRow assassin = player(102, 202, 2, Role.ASSASSIN);
        GamePlayerRow merlin = player(103, 203, 3, Role.MERLIN);
        prepareContext(assassination, assassin);
        when(repository.gamePlayer(50, 103)).thenReturn(Optional.of(merlin));

        service.assassinate(202, 50, 103);

        verify(repository).finish(50, Winner.EVIL, "MERLIN_ASSASSINATED", 103L);
    }

    private void prepareMission(GameRow game, int failCount) {
        GamePlayerRow actor = failCount == 0 ? players.get(1) : player(102, 202, 2, Role.MORGANA);
        prepareContext(game, actor);
        MissionRow mission = new MissionRow(70, 50, game.missionNo(), 60, 1, 1, null, null, "EXECUTING");
        ProposalRow proposal = new ProposalRow(60, 50, game.missionNo(), game.proposalNo(), 101,
                List.of(102L), "APPROVED", 3, 2);
        when(repository.currentMission(50, game.missionNo())).thenReturn(Optional.of(mission));
        when(repository.proposal(60)).thenReturn(Optional.of(proposal));
        when(repository.actionCount(70)).thenReturn(1);
        when(repository.failCount(70)).thenReturn(failCount);
        when(repository.players(50)).thenReturn(players);
        when(repository.gamePlayerById(101)).thenReturn(Optional.of(players.getFirst()));
    }

    private void prepareContext(GameRow game, GamePlayerRow actor) {
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(50, actor.userId())).thenReturn(actor);
    }

    private GameRow game(int missionNo, int good, int evil, Phase phase) { return game(missionNo, good, evil, phase, 1, 0); }
    private GameRow game(int missionNo, int good, int evil, Phase phase, int proposalNo, int rejections) {
        return new GameRow(50, "123456", 201, 5, "AVALON_V1", phase == Phase.FINISHED ? "FINISHED" : "PLAYING",
                phase, missionNo, proposalNo, 101L, rejections, good, evil, null,
                phase == Phase.FINISHED ? Winner.GOOD : null, null, null, null, null, null);
    }
    private GamePlayerRow player(long id, long userId, int seat, Role role) {
        return new GamePlayerRow(id, 50, userId, seat, "P" + seat, role, role.alignment(), true, true, null);
    }
}
