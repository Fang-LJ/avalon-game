package com.avalon.game.game;

import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CompletionProgressTest {
    AvalonRepository repository;
    RoomService rooms;
    GameService games;
    final List<GamePlayerRow> players = IntStream.rangeClosed(1, 5).mapToObj(seat ->
            new GamePlayerRow(10 + seat, 1, 100 + seat, seat, "玩家" + seat,
                    Role.LOYAL_SERVANT, Alignment.GOOD, true, true, null)).toList();

    @BeforeEach void setup() {
        repository = mock(AvalonRepository.class);
        rooms = mock(RoomService.class);
        games = new GameService(repository, rooms, new RoleVisibilityService(), mock(RoomEventPublisher.class));
        when(rooms.requirePlayer(1, 101)).thenReturn(players.getFirst());
        when(repository.players(1)).thenReturn(players);
        when(repository.gamePlayerById(11)).thenReturn(Optional.of(players.getFirst()));
    }
    void phase(Phase phase) {
        when(repository.game(1, false)).thenReturn(Optional.of(new GameRow(1, "123456", 101, 5,
                "AVALON_V1", "PLAYING", phase, 1, 1, 11L, 0, 0, 0,
                null, null, null, null, null, null, null)));
    }
    void proposal() {
        when(repository.currentProposal(1, 1, 1)).thenReturn(Optional.of(new ProposalRow(21, 1,
                1, 1, 11, List.of(11L, 12L), "VOTING", 0, 0)));
    }
    void mission() {
        when(repository.currentMission(1, 1)).thenReturn(Optional.of(new MissionRow(31, 1,
                1, 21, 2, 1, null, null, "EXECUTING")));
    }

    @Test void votingListsOnlyCompletedPlayerIdsAndExcludesUnvotedPlayers() throws Exception {
        phase(Phase.TEAM_VOTING); proposal();
        when(repository.voteCount(21)).thenReturn(2);
        when(repository.votedPlayerIds(21)).thenReturn(List.of(11L, 14L));
        var state = games.state(101, 1);
        assertEquals(List.of(11L, 14L), state.votedPlayerIds());
        assertFalse(state.votedPlayerIds().contains(12L));
        assertTrue(state.missionSubmittedPlayerIds().isEmpty());
        assertTrue(state.votes().isEmpty());
        var json = new ObjectMapper().valueToTree(state);
        assertTrue(json.get("votedPlayerIds").get(0).isIntegralNumber());
        assertFalse(json.toString().contains("voteChoice"));
        assertFalse(json.toString().contains("APPROVE"));
        assertFalse(json.toString().contains("REJECT"));
        verify(repository, never()).votes(anyLong());
    }
    @Test void detailedVotesRemainHiddenUntilAllPlayersHaveVoted() {
        phase(Phase.TEAM_VOTING); proposal();
        when(repository.voteCount(21)).thenReturn(4, 5);
        when(repository.votes(21)).thenReturn(List.of(new VoteView(11, 1, "玩家1", VoteChoice.REJECT)));
        assertTrue(games.state(101, 1).votes().isEmpty());
        verify(repository, never()).votes(anyLong());
        assertEquals(VoteChoice.REJECT, games.state(101, 1).votes().getFirst().choice());
        verify(repository, times(1)).votes(21);
    }
    @Test void completedEarlierProposalVotesRemainPublicWithoutLeakingCurrentVote() {
        phase(Phase.TEAM_VOTING); proposal();
        when(repository.voteCount(21)).thenReturn(1);
        when(repository.latestResolvedProposal(1)).thenReturn(Optional.of(new ProposalRow(20, 1,
                1, 1, 11, List.of(11L, 12L), "REJECTED", 2, 3)));
        when(repository.votes(20)).thenReturn(List.of(new VoteView(11, 1, "玩家1", VoteChoice.REJECT)));
        var state = games.state(101, 1);
        assertTrue(state.votes().isEmpty());
        assertEquals(VoteChoice.REJECT, state.latestVoteResult().votes().getFirst().choice());
        verify(repository, never()).votes(21);
    }
    @Test void missionProgressContainsIdsWithoutChoicesActionsOrUnsubmittedMembers() throws Exception {
        phase(Phase.MISSION_EXECUTING); proposal(); mission();
        when(repository.missionSubmittedPlayerIds(31)).thenReturn(List.of(12L));
        var state = games.state(101, 1);
        assertEquals(List.of(12L), state.missionSubmittedPlayerIds());
        assertFalse(state.missionSubmittedPlayerIds().contains(11L));
        assertFalse(state.missionSubmittedPlayerIds().contains(13L));
        assertTrue(state.votedPlayerIds().isEmpty());
        var json = new ObjectMapper().valueToTree(state);
        assertTrue(json.get("missionSubmittedPlayerIds").get(0).isIntegralNumber());
        for (String forbidden : List.of("missionActions", "actionChoice", "choiceByPlayer", "FAIL", "SUCCESS"))
            assertFalse(json.toString().contains(forbidden));
        verify(repository, never()).missionActions(anyLong());
    }
    @Test void absentProposalReturnsEmptyArrayNotNullOrQuery() throws Exception {
        phase(Phase.TEAM_VOTING);
        var state = games.state(101, 1);
        assertEquals(List.of(), state.votedPlayerIds());
        assertEquals("[]", new ObjectMapper().valueToTree(state).get("votedPlayerIds").toString());
        verify(repository, never()).votedPlayerIds(anyLong());
    }
    @Test void absentMissionReturnsEmptyArrayNotNullOrQuery() throws Exception {
        phase(Phase.MISSION_EXECUTING);
        var state = games.state(101, 1);
        assertEquals(List.of(), state.missionSubmittedPlayerIds());
        assertEquals("[]", new ObjectMapper().valueToTree(state).get("missionSubmittedPlayerIds").toString());
        verify(repository, never()).missionSubmittedPlayerIds(anyLong());
    }
    @ParameterizedTest @EnumSource(value = Phase.class, names = {"TEAM_VOTING", "MISSION_EXECUTING"}, mode = EnumSource.Mode.EXCLUDE)
    void unrelatedPhasesNeverPublishStaleCompletion(Phase phase) {
        phase(phase); proposal(); mission();
        var state = games.state(101, 1);
        assertTrue(state.votedPlayerIds().isEmpty());
        assertTrue(state.missionSubmittedPlayerIds().isEmpty());
        verify(repository, never()).votedPlayerIds(anyLong());
        verify(repository, never()).missionSubmittedPlayerIds(anyLong());
    }
    @Test void repositoryQueriesSelectOnlyPlayerIdsNotChoicesOrSubmissionOrder() {
        var jdbc = mock(JdbcTemplate.class);
        var repo = new AvalonRepository(jdbc);
        repo.votedPlayerIds(21); repo.missionSubmittedPlayerIds(31);
        verify(jdbc).queryForList("select game_player_id from t_avalon_vote where proposal_id=? order by game_player_id", Long.class, 21L);
        verify(jdbc).queryForList("select game_player_id from t_avalon_mission_action where mission_id=? order by game_player_id", Long.class, 31L);
        verifyNoMoreInteractions(jdbc);
    }
    @Test void actualJdbcProgressIsScopedAndIndependentOfVoteOrMissionChoice() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:progress-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(ds);
        try {
            jdbc.execute("create table t_avalon_vote(proposal_id bigint, game_player_id bigint, vote_choice varchar(20))");
            jdbc.execute("create table t_avalon_mission_action(mission_id bigint,game_player_id bigint,action_choice varchar(20))");
            jdbc.update("insert into t_avalon_vote values(21,14,'REJECT'),(21,11,'APPROVE'),(22,12,'APPROVE')");
            jdbc.update("insert into t_avalon_mission_action values(31,12,'FAIL'),(31,11,'SUCCESS'),(32,13,'SUCCESS')");
            var repo = new AvalonRepository(jdbc);
            assertEquals(List.of(11L, 14L), repo.votedPlayerIds(21));
            assertEquals(List.of(11L, 12L), repo.missionSubmittedPlayerIds(31));
            jdbc.update("update t_avalon_vote set vote_choice='REJECT'");
            jdbc.update("update t_avalon_mission_action set action_choice='SUCCESS'");
            assertEquals(List.of(11L, 14L), repo.votedPlayerIds(21));
            assertEquals(List.of(11L, 12L), repo.missionSubmittedPlayerIds(31));
            assertTrue(repo.votedPlayerIds(99).isEmpty());
            assertTrue(repo.missionSubmittedPlayerIds(99).isEmpty());
        } finally { jdbc.execute("shutdown"); }
    }
}
