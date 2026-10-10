package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameHistoryServiceTest {
    AvalonRepository repository;
    GameHistoryService service;
    List<GamePlayerRow> players;
    @BeforeEach void setup() {
        repository = mock(AvalonRepository.class); service = new GameHistoryService(repository);
        players = List.of(new GamePlayerRow(11, 1, 101, 1, "梅", Role.MERLIN, Alignment.GOOD, true, false, LocalDateTime.now()),
                new GamePlayerRow(12, 1, 102, 2, "刺", Role.ASSASSIN, Alignment.EVIL, true, false, LocalDateTime.now()));
        when(repository.gamePlayers(1)).thenReturn(players);
    }
    @Test void liveTimelineDoesNotReadOrSerializeSecretsOrUnfinishedVotes() throws Exception {
        when(repository.proposals(1)).thenReturn(List.of(new ProposalRow(21,1,1,1,11,List.of(11L,12L),"VOTING",1,0)));
        when(repository.missions(1)).thenReturn(List.of(new MissionRow(31,1,1,21,2,1,null,null,"EXECUTING")));
        var timeline = service.timeline(101,1);
        assertTrue(timeline.proposals().getFirst().votes().isEmpty());
        assertNull(timeline.proposals().getFirst().approveCount());
        assertTrue(timeline.missions().isEmpty());
        String json = new ObjectMapper().writeValueAsString(timeline);
        for (String secret : List.of("role", "roleCode", "roleName", "knowledgeType", "visiblePlayers", "alignment", "actions", "resultAlignment", "userId", "FAIL"))
            assertFalse(json.contains(secret), json);
        verify(repository, never()).votes(anyLong());
        verify(repository, never()).missionActions(anyLong());
        verify(repository, never()).ladyActions(anyLong());
    }
    @Test void resolvedTimelinePublishesVotesAndAggregatesOnly() {
        when(repository.proposals(1)).thenReturn(List.of(new ProposalRow(21,1,1,1,11,List.of(11L,12L),"APPROVED",2,0)));
        when(repository.votes(21)).thenReturn(List.of(new VoteView(11,1,"梅",VoteChoice.APPROVE)));
        when(repository.missions(1)).thenReturn(List.of(new MissionRow(31,1,1,21,2,1,1,1,"FAILED")));
        var timeline = service.timeline(101,1);
        assertEquals(1,timeline.proposals().getFirst().votes().size());
        assertEquals(1,timeline.missions().getFirst().failCount());
        verify(repository, never()).missionActions(anyLong()); verify(repository, never()).ladyActions(anyLong());
    }
    @Test void outsidersCannotReadEvenPublicTimeline() {
        assertThrows(BusinessException.class, () -> service.timeline(999,1));
        verify(repository,never()).proposals(anyLong());
    }
    @Test void ongoingReplayRejectedBeforeAnySecretQuery() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("PLAYING",Phase.MISSION_EXECUTING)));
        assertThrows(BusinessException.class, () -> service.replay(101,1));
        verify(repository,never()).missionActions(anyLong());verify(repository,never()).ladyActions(anyLong());
        verify(repository,never()).proposals(anyLong());
    }
    @Test void outsiderCannotReadFinishedSecrets() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("FINISHED",Phase.FINISHED)));
        assertThrows(BusinessException.class, () -> service.replay(999,1));
        verify(repository,never()).missions(anyLong());verify(repository,never()).ladyActions(anyLong());
    }
    @Test void closedButUnfinishedGameCannotBeReplayed() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("CLOSED",Phase.TEAM_BUILDING)));
        assertThrows(BusinessException.class, () -> service.replay(101,1));
    }
    @Test void archivedParticipantCanReadAllEndedDetailsIncludingActionsAndLady() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("FINISHED",Phase.FINISHED)));
        when(repository.proposals(1)).thenReturn(List.of(new ProposalRow(21,1,2,1,11,List.of(11L,12L),"APPROVED",2,0)));
        when(repository.votes(21)).thenReturn(List.of(new VoteView(11,1,"梅",VoteChoice.APPROVE)));
        when(repository.missions(1)).thenReturn(List.of(new MissionRow(31,1,2,21,2,1,1,1,"FAILED")));
        when(repository.missionActions(31)).thenReturn(List.of(new MissionActionRow(41,31,12,MissionChoice.FAIL)));
        when(repository.ladyActions(1)).thenReturn(List.of(new LadyActionRow(51,1,1,11,12,Alignment.EVIL)));
        var replay=service.replay(101,1);
        assertEquals(Role.MERLIN,replay.players().getFirst().roleCode());
        assertEquals(MissionChoice.FAIL,replay.missions().getFirst().actions().getFirst().choice());
        assertEquals(Alignment.EVIL,replay.ladyActions().getFirst().resultAlignment());
        assertEquals(11L,replay.assassinationTargetPlayerId());
        assertFalse(replay.proposals().getFirst().votes().isEmpty());
        verify(repository,never()).player(anyLong(),anyLong());
    }
    @Test void closedFinishedGameRemainsAccessibleAfterAllPlayersLeft() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("CLOSED",Phase.FINISHED)));
        assertEquals(1,service.replay(101,1).gameId());
    }
    @Test void hostEndedReplayRetainsUnfinishedProposalWithoutPublishingUnfinishedVotes() {
        var ended = new GameRow(1,"123456",101,10,"AVALON_V1","FINISHED",Phase.FINISHED,
                3,1,11L,0,1,1,12L,null,"HOST_ENDED",null,null,null,null);
        when(repository.game(1,false)).thenReturn(Optional.of(ended));
        when(repository.proposals(1)).thenReturn(List.of(new ProposalRow(21,1,3,1,11,List.of(11L,12L),"VOTING",1,0)));
        var replay = service.replay(101,1);
        assertEquals("HOST_ENDED", replay.finishReason());
        assertNull(replay.winner());
        assertEquals("VOTING", replay.proposals().getFirst().status());
        assertTrue(replay.proposals().getFirst().votes().isEmpty());
        assertNull(replay.proposals().getFirst().approveCount());
        verify(repository,never()).votes(anyLong());
    }
    GameRow game(String status,Phase phase) {
        return new GameRow(1,"123456",101,10,"AVALON_V1",status,phase,4,1,11L,0,3,1,12L,
                Winner.EVIL,"MERLIN_ASSASSINATED",11L,null,null,null);
    }
}
