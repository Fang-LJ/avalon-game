package com.avalon.game.bot;

import com.avalon.game.game.*;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BotTurnServiceTest {
    AvalonRepository repository; GameService games; BotStrategy strategy; BotTurnService service;
    List<GamePlayerRow> players;
    @BeforeEach void setup() {
        repository=mock(AvalonRepository.class); games=mock(GameService.class); strategy=mock(BotStrategy.class);
        service=new BotTurnService(repository,games,strategy,mock(RoomEventPublisher.class));
        players=List.of(player(1,101,Role.MERLIN,false),player(2,102,Role.ASSASSIN,false),player(3,103,Role.LOYAL_SERVANT,false));
        when(repository.players(50)).thenReturn(players);
        when(repository.botUserIds(50)).thenReturn(Set.of(102L,103L));
    }
    GamePlayerRow player(long id,long user,Role role,boolean confirmed) {
        return new GamePlayerRow(id,50,user,(int)id,"P"+id,role,role.alignment(),confirmed,true,null);
    }
    void phase(Phase phase) {
        when(repository.game(50,true)).thenReturn(Optional.of(new GameRow(50,"123456",101,5,"AVALON_V1","PLAYING",
                phase,1,1,2L,0,0,0,2L,null,null,null,null,null,null)));
    }
    @Test void confirmsOnlyOneUnconfirmedBotNeverHuman() {
        phase(Phase.ROLE_CONFIRM); service.act(50);
        verify(games).confirmRole(102,50); verifyNoMoreInteractions(games);
    }
    @Test void alreadyConfirmedBotsDoNotRepeatConfirmation() {
        phase(Phase.ROLE_CONFIRM);
        when(repository.players(50)).thenReturn(List.of(player(1,101,Role.MERLIN,false),player(2,102,Role.ASSASSIN,true)));
        service.act(50); verifyNoInteractions(games);
    }
    @Test void botLeaderUsesItsOwnPlayerIdAndRequiredTeamSize() {
        phase(Phase.TEAM_BUILDING);
        when(strategy.team(2,List.of(1L,2L,3L),2)).thenReturn(List.of(2L,3L));
        service.act(50); verify(games).submitTeam(102,50,List.of(2L,3L));
    }
    @Test void humanLeaderIsNeverAutoSubmitted() {
        phase(Phase.TEAM_BUILDING); when(repository.botUserIds(50)).thenReturn(Set.of(103L));
        service.act(50); verifyNoInteractions(games,strategy);
    }
    @Test void votesSkipBotsAlreadySubmittedAndUseTheStrategy() {
        phase(Phase.TEAM_VOTING);
        when(repository.currentProposal(50,1,1)).thenReturn(Optional.of(new ProposalRow(60,50,1,1,2,List.of(1L,2L),"VOTING",0,0)));
        when(repository.hasVote(60,2)).thenReturn(true);
        when(strategy.vote()).thenReturn(VoteChoice.REJECT);
        service.act(50); verify(games).vote(103,50,VoteChoice.REJECT); verifyNoMoreInteractions(games);
        when(repository.hasVote(60,3)).thenReturn(true); service.act(50); verifyNoMoreInteractions(games);
    }
    @Test void missionOnlyUsesAssignedBotAlignmentAndSkipsNonMembersAndDuplicateActions() {
        phase(Phase.MISSION_EXECUTING);
        when(repository.currentProposal(50,1,1)).thenReturn(Optional.of(new ProposalRow(60,50,1,1,2,List.of(1L,2L),"APPROVED",5,0)));
        when(repository.currentMission(50,1)).thenReturn(Optional.of(new MissionRow(70,50,1,60,2,1,null,null,"EXECUTING")));
        when(strategy.mission(Alignment.EVIL)).thenReturn(MissionChoice.FAIL);
        service.act(50); verify(games).mission(102,50,MissionChoice.FAIL);
        when(repository.hasAction(70,2)).thenReturn(true); service.act(50); verifyNoMoreInteractions(games);
        verify(strategy,never()).mission(Alignment.GOOD);
    }
    @Test void botLadyExcludesSelfAndPreviousHoldersWithoutBroadcastingPrivateResult() {
        phase(Phase.LADY_OF_LAKE); when(repository.ladyHolderHistory(50)).thenReturn(Set.of(1L));
        when(strategy.target(List.of(3L))).thenReturn(3L);
        service.act(50); verify(games).inspectWithLady(102,50,3);
        verifyNoMoreInteractions(games);
    }
    @Test void botAssassinSelectsRandomNonSelfTargetNotActualMerlin() {
        phase(Phase.ASSASSINATION); when(strategy.target(List.of(1L,3L))).thenReturn(3L);
        service.act(50); verify(games).assassinate(102,50,3);
    }
    @Test void botAssassinExcludesEveryRevealedEvilRoleButDoesNotPreferMerlin() {
        phase(Phase.ASSASSINATION);
        when(repository.players(50)).thenReturn(List.of(player(1,101,Role.MERLIN,true), player(2,102,Role.ASSASSIN,true),
                player(3,103,Role.LOYAL_SERVANT,true), player(4,104,Role.MORGANA,true),
                player(5,105,Role.MINION,true), player(6,106,Role.MORDRED,true), player(7,107,Role.OBERON,true)));
        when(strategy.target(List.of(1L,3L))).thenReturn(3L);
        service.act(50);
        verify(strategy).target(List.of(1L,3L)); verify(games).assassinate(102,50,3);
    }
    @ParameterizedTest @ValueSource(strings={"TEAM_BUILDING","TEAM_VOTING","MISSION_EXECUTING","LADY_OF_LAKE"})
    void botsNeverStartEarlyAssassination(String value) {
        phase(Phase.valueOf(value)); service.act(50);
        verify(games,never()).startAssassination(anyLong(),anyLong());
    }
    @ParameterizedTest @ValueSource(strings={"WAITING","FINISHED","CLOSED"})
    void noAutomatedActionOutsidePlaying(String status) {
        when(repository.game(50,true)).thenReturn(Optional.of(new GameRow(50,"123456",101,5,"AVALON_V1",status,
                Phase.FINISHED,1,1,2L,0,0,0,null,null,null,null,null,null,null)));
        service.act(50); verifyNoInteractions(games,strategy); verify(repository,never()).botUserIds(anyLong());
    }
    @Test void schedulerContinuesOtherRoomsIfOneBotActionFails() {
        when(repository.activeBotGameIds()).thenReturn(List.of(1L,2L));
        BotTurnService turns=mock(BotTurnService.class);
        doThrow(new IllegalStateException()).when(turns).act(1);
        new BotScheduler(repository,turns).tick();
        verify(turns).act(2);
    }
}
