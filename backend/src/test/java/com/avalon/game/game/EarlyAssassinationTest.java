package com.avalon.game.game;

import com.avalon.game.auth.*;
import com.avalon.game.common.*;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EarlyAssassinationTest {
    AvalonRepository repository;
    RoomService rooms;
    RoomEventPublisher events;
    GameService service;
    List<GamePlayerRow> players;

    @BeforeEach void setup() {
        repository = mock(AvalonRepository.class); rooms = mock(RoomService.class);
        events = mock(RoomEventPublisher.class);
        service = spy(new GameService(repository, rooms, new RoleVisibilityService(), events));
        players = Arrays.stream(Role.values()).map(role -> new GamePlayerRow(role.ordinal()+1, 50,
                100+role.ordinal(), role.ordinal()+1, "玩家"+role.ordinal(), role, role.alignment(), true, true, null)).toList();
        when(repository.players(50)).thenReturn(players);
        players.forEach(player -> {
            when(rooms.requirePlayer(50, player.userId())).thenReturn(player);
            when(repository.gamePlayer(50, player.id())).thenReturn(Optional.of(player));
            when(repository.gamePlayerById(player.id())).thenReturn(Optional.of(player));
        });
    }
    GamePlayerRow player(Role role) { return players.stream().filter(p -> p.role()==role).findFirst().orElseThrow(); }
    void phase(String status, Phase phase, int goodScore) {
        var row = new GameRow(50, "123456", 100, 10, "AVALON_V1", status, phase, 2, 1,
                player(Role.MERLIN).id(), 0, goodScore, 0, null, null, null, null, null, null, null);
        when(repository.game(50, true)).thenReturn(Optional.of(row));
        when(repository.game(50, false)).thenReturn(Optional.of(row));
    }
    @ParameterizedTest @EnumSource(value=Phase.class, names={"TEAM_BUILDING","TEAM_VOTING","MISSION_EXECUTING","LADY_OF_LAKE"})
    void onlyChangesPhaseAndPublishesInvalidationAfterLock(Phase phase) {
        phase("PLAYING", phase, 1);
        doReturn(null).when(service).state(anyLong(), anyLong());
        service.startAssassination(player(Role.ASSASSIN).userId(), 50);
        var order = inOrder(repository, rooms, events);
        order.verify(repository).game(50, true);
        order.verify(rooms).requirePlayer(50, player(Role.ASSASSIN).userId());
        order.verify(repository).setPhase(50, Phase.ASSASSINATION);
        order.verify(events).publish(50, "ASSASSINATION_STARTED");
        // No task completion, score change, deletion or fabricated votes.
        verifyNoMoreInteractions(repository, events);
    }
    @ParameterizedTest @EnumSource(value=Role.class, names="ASSASSIN", mode=EnumSource.Mode.EXCLUDE)
    void allNonAssassinsRejectedIncludingOtherEvilRoles(Role role) {
        phase("PLAYING", Phase.TEAM_BUILDING, 0);
        assertEquals("FORBIDDEN", assertThrows(BusinessException.class,
                () -> service.startAssassination(player(role).userId(),50)).getCode());
        verify(repository, never()).setPhase(anyLong(), any()); verifyNoInteractions(events);
    }
    @ParameterizedTest @EnumSource(value=Phase.class, names={"ROLE_CONFIRM","MISSION_RESULT","ASSASSINATION","FINISHED"})
    void forbiddenPhasesCannotStartOrRepeatAssassination(Phase phase) {
        phase("PLAYING", phase, 0);
        assertEquals("INVALID_PHASE", assertThrows(BusinessException.class,
                () -> service.startAssassination(player(Role.ASSASSIN).userId(),50)).getCode());
        verify(repository, never()).setPhase(anyLong(), any());
    }
    @ParameterizedTest @ValueSource(strings={"WAITING","FINISHED","CLOSED"})
    void statusMustBePlayingEvenIfPhaseIsAllowed(String status) {
        phase(status, Phase.TEAM_BUILDING, 0);
        assertThrows(BusinessException.class, () -> service.startAssassination(player(Role.ASSASSIN).userId(),50));
        verify(repository, never()).setPhase(anyLong(), any());
    }
    @Test void outsiderAndUnknownGameRejectedWithoutMutation() {
        phase("PLAYING", Phase.TEAM_BUILDING, 0);
        when(rooms.requirePlayer(50, 999)).thenThrow(new BusinessException("FORBIDDEN", "不是房间成员"));
        assertThrows(BusinessException.class, () -> service.startAssassination(999,50));
        assertThrows(BusinessException.class, () -> service.startAssassination(100,999));
        verify(repository, never()).setPhase(anyLong(), any());
    }
    @ParameterizedTest @ValueSource(ints={0,1,2,3})
    void allViewersReceiveOnlyEvilIdentitiesDuringBothEarlyAndNormalAssassination(int goodScore) throws Exception {
        phase("PLAYING", Phase.ASSASSINATION, goodScore);
        for (var viewer : players) {
            var state = service.state(viewer.userId(),50);
            assertEquals(goodScore<3, state.assassinationEarly());
            assertTrue(state.identities().isEmpty());
            assertEquals(List.of("MORGANA","ASSASSIN","MINION","MORDRED","OBERON"),
                    state.revealedEvilIdentities().stream().map(GameService.RevealedIdentity::roleCode).toList());
            String json = new ObjectMapper().writeValueAsString(state);
            for (String good : List.of("MERLIN","PERCIVAL","LOYAL_SERVANT")) assertFalse(json.contains(good));
            assertFalse(json.contains("visiblePlayers")); assertFalse(json.contains("knowledgeType"));
            assertEquals(5, GameService.RevealedIdentity.class.getRecordComponents().length);
        }
        verify(repository, never()).user(anyLong()); // No N+1 or finished-only identity read.
        verify(repository, never()).gamePlayerIdentities(anyLong());
    }
    @ParameterizedTest @EnumSource(value=Phase.class, names="ASSASSINATION", mode=EnumSource.Mode.EXCLUDE)
    void revealIsEmptyOutsideAssassinationIncludingFinished(Phase phase) throws Exception {
        phase(phase==Phase.FINISHED ? "FINISHED" : "PLAYING", phase,0);
        var state = service.state(100,50);
        assertTrue(state.revealedEvilIdentities().isEmpty()); assertFalse(state.assassinationEarly());
        if (phase!=Phase.FINISHED) {
            assertTrue(state.identities().isEmpty());
            assertFalse(new ObjectMapper().writeValueAsString(state).contains("roleCode"));
        }
    }
    @ParameterizedTest @EnumSource(value=Role.class, names={"MORGANA","ASSASSIN","MINION","MORDRED","OBERON"})
    void evilAndSelfCannotBeTargets(Role role) {
        phase("PLAYING", Phase.ASSASSINATION,0);
        assertEquals("PARAM_ERROR", assertThrows(BusinessException.class,
                () -> service.assassinate(player(Role.ASSASSIN).userId(),50,player(role).id())).getCode());
        verify(repository, never()).finish(anyLong(), any(), anyString(), any());
    }
    @Test void wrongPhaseNonAssassinAndForeignTargetCannotFinishGame() {
        phase("PLAYING", Phase.TEAM_BUILDING,0);
        assertThrows(BusinessException.class, () -> service.assassinate(player(Role.ASSASSIN).userId(),50,player(Role.MERLIN).id()));
        phase("PLAYING", Phase.ASSASSINATION,0);
        assertThrows(BusinessException.class, () -> service.assassinate(player(Role.MORGANA).userId(),50,player(Role.MERLIN).id()));
        assertThrows(BusinessException.class, () -> service.assassinate(player(Role.ASSASSIN).userId(),50,999));
        verify(repository, never()).finish(anyLong(), any(), anyString(), any());
    }
    @ParameterizedTest @CsvSource({"0,MERLIN,EVIL,EARLY_MERLIN_ASSASSINATED", "1,PERCIVAL,GOOD,EARLY_ASSASSINATION_MISSED",
            "2,LOYAL_SERVANT,GOOD,EARLY_ASSASSINATION_MISSED", "3,MERLIN,EVIL,MERLIN_ASSASSINATED", "3,PERCIVAL,GOOD,ASSASSINATION_MISSED"})
    void earlyAndNormalFinishesKeepCorrectWinnerReasonAndTarget(int score, Role target, Winner winner, String reason) {
        phase("PLAYING", Phase.ASSASSINATION, score);
        doReturn(null).when(service).state(anyLong(), anyLong());
        service.assassinate(player(Role.ASSASSIN).userId(),50,player(target).id());
        verify(repository).finish(50,winner,reason,player(target).id());
        verify(events).publish(50,"GAME_FINISHED");
    }
    @Test void activeAssassinationCannotReturnToAnyTaskOrLadyOperation() {
        phase("PLAYING", Phase.ASSASSINATION,0);
        long user = player(Role.ASSASSIN).userId();
        assertThrows(BusinessException.class, () -> service.submitTeam(user,50,List.of(1L,2L,3L)));
        assertThrows(BusinessException.class, () -> service.vote(user,50,VoteChoice.APPROVE));
        assertThrows(BusinessException.class, () -> service.mission(user,50,MissionChoice.SUCCESS));
        assertThrows(BusinessException.class, () -> service.inspectWithLady(user,50,1));
        assertThrows(BusinessException.class, () -> service.confirmRole(user,50));
        verify(repository, never()).setPhase(anyLong(),any());
    }
    @Test void newEndpointRequiresJwtAndUsesOnlyAuthenticatedUser() throws Exception {
        var jwt = mock(JwtService.class); when(jwt.parse("valid")).thenReturn(101L);
        var controllerService = mock(GameService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new GameController(controllerService))
                .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new AuthInterceptor(jwt)).build();
        mvc.perform(post("/api/avalon/game/50/assassination/start")).andExpect(status().isUnauthorized());
        verifyNoInteractions(controllerService);
        mvc.perform(post("/api/avalon/game/50/assassination/start?userId=999").header("Authorization","Bearer valid"))
                .andExpect(status().isOk());
        verify(controllerService).startAssassination(101,50);
        assertNotNull(GameService.class.getMethod("startAssassination",long.class,long.class).getAnnotation(Transactional.class));
    }
}
