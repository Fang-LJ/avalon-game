package com.avalon.game.room;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.game.AvalonRepository.RoomPlayerViewRow;
import com.avalon.game.game.GameTypes.Phase;
import com.avalon.game.realtime.RoomEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RoomServiceTest {
    private AvalonRepository repository;
    private RoomEventPublisher events;
    private RoomService service;

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        events = mock(RoomEventPublisher.class);
        service = new RoomService(repository, events);
    }

    @Test void creatorAutomaticallyTakesSeatOne() {
        RoomService spy = spy(service);
        RoomService.RoomView expected = view(1, 1, 1, false);
        when(repository.nickname(100)).thenReturn("房主");
        when(repository.waitingRoomCodeExists(anyString())).thenReturn(false);
        when(repository.insertWaitingGame(anyString(), eq(100L), eq(5))).thenReturn(1L);
        doReturn(expected).when(spy).get(100, 1);

        assertSame(expected, spy.create(100, 5, "不应采用客户端昵称"));

        verify(repository).insertGamePlayer(1, 100, "房主", 1);
    }

    @Test void ordinaryPlayerLeavingFinishedGameDoesNotCloseIt() {
        GamePlayerRow leaving = player(10, 100, 3);
        prepareFinishedGame(leaving, List.of(player(11, 101, 1), player(12, 102, 2)), 101);

        service.leave(100, 1);

        verify(repository).leaveGamePlayer(10);
        verify(repository, never()).closeGame(1);
        verify(repository, never()).updateGameOwner(anyLong(), anyLong());
    }

    @Test void oldFinishedGameUrlResolvesToNewestRematchLobbyForSameUser() {
        GameRow old = game("FINISHED", 100);
        GameRow replacement = new GameRow(2, "123456", 100, 5, "AVALON_V1", "WAITING", null,
                1, 1, null, 0, 0, 0, null, null, null, null, null, null, null);
        GamePlayerRow me = new GamePlayerRow(20, 2, 100, 1, "P1", null, null, false, true, null);
        when(repository.game(1, false)).thenReturn(Optional.of(old));
        when(repository.latestGameForRoomCodeAndUser("123456", 100)).thenReturn(Optional.of(replacement));
        when(repository.player(2, 100)).thenReturn(Optional.of(me));
        when(repository.roomPlayers(2)).thenReturn(List.of(
                new RoomPlayerViewRow(20, 100, 1, "P1", null, true)));

        RoomService.RoomView result = service.get(100, 1);

        assertEquals(2, result.roomId());
        assertNull(result.currentGameId());
    }

    @Test void ownerLeavingFinishedGameTransfersOwnershipWithoutReseating() {
        GamePlayerRow leaving = player(10, 100, 1);
        prepareFinishedGame(leaving, List.of(player(12, 102, 4), player(11, 101, 2)), 100);

        service.leave(100, 1);

        verify(repository).updateGameOwner(1, 101);
        verify(repository, never()).updateSeat(anyLong(), any());
        verify(repository, never()).closeGame(1);
    }

    @Test void finalPlayerLeavingFinishedGameClosesIt() {
        GamePlayerRow leaving = player(10, 100, 1);
        prepareFinishedGame(leaving, List.of(), 100);

        service.leave(100, 1);

        verify(repository).closeGame(1);
    }

    @Test void joiningPlayerTakesSmallestEmptySeatRatherThanPlayerCountPlusOne() {
        RoomService spy = spy(service);
        when(repository.waitingGameByCode("123456", true)).thenReturn(Optional.of(game("WAITING", 100)));
        when(repository.player(1, 103)).thenReturn(Optional.empty());
        when(repository.activeGameForUser(103)).thenReturn(Optional.empty());
        when(repository.players(1)).thenReturn(List.of(player(10,100,1),player(12,102,3)));
        when(repository.nickname(103)).thenReturn("P3");
        doReturn(view(1,3,3,false)).when(spy).get(103,1);

        spy.join(103,"123456",null);

        verify(repository).insertGamePlayer(1,103,"P3",2);
        verify(events).publish(1,"PLAYER_JOINED");
    }

    @Test void waitingPlayerCanStandWithoutLeavingRoom() {
        RoomService spy = spy(service);
        GamePlayerRow player=player(10,100,2);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(player));
        doReturn(view(1,2,1,false)).when(spy).get(100,1);

        spy.stand(100,1);

        verify(repository).updateSeat(10,null);
        verify(repository,never()).deleteGamePlayer(anyLong());
        verify(repository,never()).leaveGamePlayer(anyLong());
        verify(events).publish(1,"PLAYER_STOOD");
    }

    @Test void standingPlayerCanSitAndSeatedPlayerCanMoveDirectly() {
        RoomService spy=spy(service);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        doReturn(view(1,2,2,false)).when(spy).get(100,1);
        GamePlayerRow standing=player(10,100,null);
        when(repository.player(1,100)).thenReturn(Optional.of(standing));
        when(repository.players(1)).thenReturn(List.of(standing,player(11,101,1)));
        spy.seat(100,1,2);
        verify(repository).updateSeat(10,2);
        verify(events).publish(1,"PLAYER_SEATED");

        reset(events);
        GamePlayerRow seated=player(10,100,2);
        when(repository.player(1,100)).thenReturn(Optional.of(seated));
        when(repository.players(1)).thenReturn(List.of(player(11,101,1),seated));
        spy.seat(100,1,4);
        verify(repository).updateSeat(10,4);
        verify(events).publish(1,"PLAYER_MOVED");
    }

    @Test void occupiedSeatAndDatabaseRaceReturnFriendlySeatTakenError() {
        RoomService spy=spy(service);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        GamePlayerRow me=player(10,100,1);
        when(repository.player(1,100)).thenReturn(Optional.of(me));
        when(repository.players(1)).thenReturn(List.of(me,player(11,101,2)));
        BusinessException occupied=assertThrows(BusinessException.class,()->spy.seat(100,1,2));
        assertEquals("SEAT_TAKEN",occupied.getCode());

        when(repository.players(1)).thenReturn(List.of(me));
        doThrow(new DuplicateKeyException("race")).when(repository).updateSeat(10,3);
        BusinessException raced=assertThrows(BusinessException.class,()->spy.seat(100,1,3));
        assertEquals("该座位刚刚被其他玩家占用，请重新选择",raced.getMessage());
    }

    @Test void nonWaitingGamesAndNonMembersCannotChangeSeats() {
        when(repository.game(1,true)).thenReturn(Optional.of(game("PLAYING",100)));
        assertEquals("INVALID_PHASE",assertThrows(BusinessException.class,()->service.seat(100,1,2)).getCode());
        when(repository.game(1,true)).thenReturn(Optional.of(game("FINISHED",100)));
        assertEquals("INVALID_PHASE",assertThrows(BusinessException.class,()->service.stand(100,1)).getCode());
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,999)).thenReturn(Optional.empty());
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->service.seat(999,1,2)).getCode());
    }

    @Test void leavingWaitingLobbyKeepsEveryOtherSeatNumber() {
        GamePlayerRow leaving=player(11,101,2);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,101)).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(List.of(player(10,100,1),player(12,102,3)));

        service.leave(101,1);

        verify(repository).deleteGamePlayer(11);
        verify(repository,never()).updateSeat(anyLong(),any());
    }

    @Test void ownerTransferPrefersLowestSeatedPlayerThenEarliestStandingPlayer() {
        GamePlayerRow leaving=player(10,100,1);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(List.of(player(13,103,null),player(12,102,4),player(11,101,2)));
        service.leave(100,1);
        verify(repository).updateGameOwner(1,101);

        reset(repository);
        when(repository.game(1,true)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(List.of(player(13,103,null),player(11,101,null)));
        service.leave(100,1);
        verify(repository).updateGameOwner(1,101);
    }

    @Test void roomViewCountsMembersAndSeatsSeparatelyAndRequiresCompleteCoverageToStart() {
        when(repository.game(1,false)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(player(10,100,1)));
        when(repository.roomPlayers(1)).thenReturn(List.of(
                row(10,100,1),row(11,101,2),row(12,102,3),row(13,103,4),row(14,104,5)));
        RoomService.RoomView full=service.get(100,1);
        assertEquals(5,full.currentPlayers());assertEquals(5,full.seatedPlayers());assertTrue(full.canStart());
        assertEquals(1,full.mySeatNo());assertTrue(full.players().getFirst().seated());

        when(repository.roomPlayers(1)).thenReturn(List.of(
                row(10,100,1),row(11,101,2),row(12,102,3),row(13,103,4),row(14,104,null)));
        RoomService.RoomView standing=service.get(100,1);
        assertEquals(5,standing.currentPlayers());assertEquals(4,standing.seatedPlayers());assertFalse(standing.canStart());
    }

    @Test void roomViewReturnsAvatarWithoutPrivateRoleKnowledge() throws Exception {
        when(repository.game(1,false)).thenReturn(Optional.of(game("WAITING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(player(10,100,1)));
        when(repository.roomPlayers(1)).thenReturn(List.of(
                new RoomPlayerViewRow(10,100,1,"P1","https://avatar/1",true),
                new RoomPlayerViewRow(11,101,2,"P2",null,true)));
        RoomService.RoomView result=service.get(100,1);
        assertEquals("https://avatar/1",result.players().getFirst().avatarUrl());
        assertNull(result.players().get(1).avatarUrl());
        String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(result);
        assertFalse(json.contains("role"));assertFalse(json.contains("alignment"));assertFalse(json.contains("knowledgeType"));
        assertFalse(json.contains("roleCode"));assertFalse(json.contains("roleName"));assertFalse(json.contains("visiblePlayers"));
    }

    @Test void playerLeavingActiveGameIsOnlyMarkedOfflineSoHistoryRemains() {
        GamePlayerRow leaving=player(10,100,1);
        when(repository.game(1,true)).thenReturn(Optional.of(game("PLAYING",100)));
        when(repository.player(1,100)).thenReturn(Optional.of(leaving));
        service.leave(100,1);
        verify(repository).setPlayerOnline(10,false);
        verify(repository,never()).deleteGamePlayer(anyLong());
    }

    @Test void currentDoesNotReturnArchivedFinishedGeneration() {
        when(repository.activeGameForUser(100)).thenReturn(Optional.empty());
        assertNull(service.current(100));
    }

    private RoomService.RoomView view(long id,int members,int seated,boolean canStart) {
        return new RoomService.RoomView(id,"123456",5,"WAITING",null,true,10,1,members,seated,List.of(),canStart);
    }
    private void prepareFinishedGame(GamePlayerRow leaving, List<GamePlayerRow> remaining, long owner) {
        when(repository.game(1, true)).thenReturn(Optional.of(game("FINISHED", owner)));
        when(repository.player(1, leaving.userId())).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(remaining);
    }
    private GameRow game(String status,long owner) {
        Phase phase="PLAYING".equals(status)?Phase.TEAM_BUILDING:"FINISHED".equals(status)?Phase.FINISHED:null;
        return new GameRow(1,"123456",owner,5,"AVALON_V1",status,phase,1,1,null,0,0,0,null,null,null,null,null,null,null);
    }
    private GamePlayerRow player(long id,long userId,Integer seat) {
        return new GamePlayerRow(id,1,userId,seat,"P"+id,null,null,false,true,null);
    }
    private RoomPlayerViewRow row(long id,long userId,Integer seat) {
        return new RoomPlayerViewRow(id,userId,seat,"P"+id,null,true);
    }
}
