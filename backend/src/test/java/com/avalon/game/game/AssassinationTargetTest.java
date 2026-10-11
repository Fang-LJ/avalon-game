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
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AssassinationTargetTest {
    AvalonRepository repository; RoomService rooms; RoomEventPublisher events; GameService service;
    List<GamePlayerRow> players;
    @BeforeEach void setup() {
        repository=mock(AvalonRepository.class);rooms=mock(RoomService.class);events=mock(RoomEventPublisher.class);
        service=new GameService(repository,rooms,new RoleVisibilityService(),events);
        players=Arrays.stream(Role.values()).map(role->new GamePlayerRow(role.ordinal()+1,50,
                100+role.ordinal(),role.ordinal()+1,"玩家"+role.ordinal(),role,role.alignment(),true,true,null)).toList();
        when(repository.players(50)).thenReturn(players);
        players.forEach(p->{when(rooms.requirePlayer(50,p.userId())).thenReturn(p);
            when(repository.gamePlayer(50,p.id())).thenReturn(Optional.of(p));
            when(repository.gamePlayerById(p.id())).thenReturn(Optional.of(p));});
        phase("PLAYING",Phase.ASSASSINATION);
    }
    GamePlayerRow player(Role role){return players.stream().filter(p->p.role()==role).findFirst().orElseThrow();}
    void phase(String status,Phase phase){
        var game=new GameRow(50,"123456",100,10,"AVALON_V1",status,phase,2,1,player(Role.MERLIN).id(),0,1,0,null,null,null,null,null,null,null);
        when(repository.game(50,true)).thenReturn(Optional.of(game));when(repository.game(50,false)).thenReturn(Optional.of(game));
    }
    @Test void selectedTargetAndSwitchArePublicToAllViewersButDoNotSettleOrWriteHistory() throws Exception {
        for(var viewer:players)assertNull(service.state(viewer.userId(),50).assassinationTarget());
        long assassin=player(Role.ASSASSIN).userId();
        for(var target:List.of(player(Role.MERLIN),player(Role.PERCIVAL),player(Role.LOYAL_SERVANT))){
            var response=service.selectAssassinationTarget(assassin,50,target.id());
            assertEquals("ASSASSINATION",response.phase());
            assertEquals(target.id(),response.assassinationTarget().playerId());
            for(var viewer:players){
                var state=service.state(viewer.userId(),50);
                assertEquals(response.assassinationTarget(),state.assassinationTarget());
                assertEquals(response.assassinationTargetRevision(),state.assassinationTargetRevision());
                assertEquals(1,state.goodScore());assertEquals(0,state.evilScore());assertNull(state.winner());
                String json=new ObjectMapper().writeValueAsString(state.assassinationTarget());
                for(String secret:List.of("role","alignment","MERLIN","PERCIVAL","visiblePlayers"))assertFalse(json.contains(secret));
            }
        }
        verify(events,times(3)).publish(50,"ASSASSINATION_TARGET_CHANGED");
        verify(repository,never()).finish(anyLong(),any(),any(),any());
        verify(repository,never()).setPhase(anyLong(),any());
        var fields=Arrays.stream(GameService.AssassinationTarget.class.getRecordComponents()).map(c->c.getName()).toList();
        assertEquals(List.of("playerId","seatNo","nickname"),fields);
    }
    @ParameterizedTest @EnumSource(value=Role.class,names="ASSASSIN",mode=EnumSource.Mode.EXCLUDE)
    void nonAssassinCannotSelect(Role role){
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->service.selectAssassinationTarget(player(role).userId(),50,player(Role.MERLIN).id())).getCode());
        verifyNoInteractions(events);
    }
    @ParameterizedTest @EnumSource(value=Phase.class,names="ASSASSINATION",mode=EnumSource.Mode.EXCLUDE)
    void onlyAssassinationMaySelect(Phase phase){
        phase("PLAYING",phase);
        assertEquals("INVALID_PHASE",assertThrows(BusinessException.class,()->service.selectAssassinationTarget(player(Role.ASSASSIN).userId(),50,1)).getCode());
        verifyNoInteractions(events);
    }
    @ParameterizedTest @EnumSource(value=Role.class,names={"MORGANA","ASSASSIN","MINION","MORDRED","OBERON"})
    void allEvilAndSelfAreRejected(Role role){
        assertEquals("PARAM_ERROR",assertThrows(BusinessException.class,()->service.selectAssassinationTarget(player(Role.ASSASSIN).userId(),50,player(role).id())).getCode());
        verifyNoInteractions(events);
    }
    @Test void unknownMemberGameTargetAndFinishedStatusAreRejected(){
        long user=player(Role.ASSASSIN).userId();
        when(rooms.requirePlayer(50,999)).thenThrow(new BusinessException("FORBIDDEN","不是房间成员"));
        assertThrows(BusinessException.class,()->service.selectAssassinationTarget(999,50,1));
        assertThrows(BusinessException.class,()->service.selectAssassinationTarget(user,999,1));
        assertThrows(BusinessException.class,()->service.selectAssassinationTarget(user,50,999));
        phase("FINISHED",Phase.ASSASSINATION);
        assertThrows(BusinessException.class,()->service.selectAssassinationTarget(user,50,1));
    }
    @Test void endpointRequiresJwtAndCannotUseClientSuppliedUserId() throws Exception {
        var jwt=mock(JwtService.class);when(jwt.parse("valid")).thenReturn(101L);
        var api=mock(GameService.class);
        var mvc=MockMvcBuilders.standaloneSetup(new GameController(api)).setControllerAdvice(new GlobalExceptionHandler())
                .addInterceptors(new AuthInterceptor(jwt)).build();
        mvc.perform(post("/api/avalon/game/50/assassination/target").contentType("application/json").content("{\"targetPlayerId\":3}"))
                .andExpect(status().isUnauthorized());verifyNoInteractions(api);
        mvc.perform(post("/api/avalon/game/50/assassination/target?userId=999").header("Authorization","Bearer valid")
                .contentType("application/json").content("{\"targetPlayerId\":3}")).andExpect(status().isOk());
        verify(api).selectAssassinationTarget(101,50,3);
        assertNotNull(GameService.class.getMethod("selectAssassinationTarget",long.class,long.class,long.class).getAnnotation(Transactional.class));
    }
}
