package com.avalon.game.room;

import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.realtime.RoomEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RoomServiceTest {
    private AvalonRepository repository;
    private RoomService service;

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        service = new RoomService(repository, mock(RoomEventPublisher.class));
    }

    @Test void ordinaryPlayerLeavingFinishedGameDoesNotCloseIt() {
        GamePlayerRow leaving = player(10, 100, 3);
        prepareFinishedGame(leaving, List.of(player(11, 101, 1), player(12, 102, 2)), 101);
        service.leave(100, 1);
        verify(repository).leaveGamePlayer(10);
        verify(repository, never()).closeGame(1);
        verify(repository, never()).updateGameOwner(anyLong(), anyLong());
    }

    @Test void createPersistsWaitingGameAndFirstGamePlayer() {
        RoomService spy = spy(service);
        RoomService.RoomView view = new RoomService.RoomView(1, "123456", 5, "WAITING", null,
                true, 10, 1, List.of(), false);
        when(repository.nickname(100)).thenReturn("原昵称");
        when(repository.waitingRoomCodeExists(anyString())).thenReturn(false);
        when(repository.insertWaitingGame(anyString(), eq(100L), eq(5))).thenReturn(1L);
        doReturn(view).when(spy).get(100, 1);

        assertSame(view, spy.create(100, 5, "新昵称"));
        verify(repository).insertWaitingGame(matches("\\d{6}"), eq(100L), eq(5));
        verify(repository).insertGamePlayer(1, 100, "原昵称", 1);
    }

    @Test void joinOnlyUsesWaitingGameAndPersistsNextSeat() {
        RoomService spy = spy(service);
        GameRow waiting = game("WAITING", 100);
        when(repository.waitingGameByCode("123456", true)).thenReturn(Optional.of(waiting));
        when(repository.player(1, 101)).thenReturn(Optional.empty());
        when(repository.activeGameForUser(101)).thenReturn(Optional.empty());
        when(repository.players(1)).thenReturn(List.of(player(10, 100, 1)));
        when(repository.nickname(101)).thenReturn("P2");
        RoomService.RoomView view = new RoomService.RoomView(1, "123456", 5, "WAITING", null,
                false, 11, 2, List.of(), false);
        doReturn(view).when(spy).get(101, 1);

        assertSame(view, spy.join(101, "123456", null));
        verify(repository).insertGamePlayer(1, 101, "P2", 2);
    }

    @Test void oldFinishedGameUrlResolvesToNewestRestartForSameUser() {
        GameRow old = game("FINISHED", 100);
        GameRow replacement = new GameRow(2, "123456", 100, 5, "AVALON_V1", "PLAYING", null,
                1, 1, null, 0, 0, 0, null, null, null, null, null, null, null);
        GamePlayerRow me = new GamePlayerRow(20, 2, 100, 1, "P1", null, null, false, true, null);
        when(repository.game(1, false)).thenReturn(Optional.of(old));
        when(repository.latestGameForRoomCodeAndUser("123456", 100)).thenReturn(Optional.of(replacement));
        when(repository.player(2, 100)).thenReturn(Optional.of(me));
        when(repository.players(2)).thenReturn(List.of(me));

        RoomService.RoomView result = service.get(100, 1);

        assertEquals(2, result.roomId());
        assertEquals(2, result.currentGameId());
    }

    @Test void ownerLeavingFinishedGameTransfersOwnershipWithoutReseating() {
        GamePlayerRow leaving = player(10, 100, 1);
        prepareFinishedGame(leaving, List.of(player(12, 102, 4), player(11, 101, 2)), 100);
        service.leave(100, 1);
        verify(repository).updateGameOwner(1, 101);
        verify(repository, never()).reseat(anyLong(), anyInt());
        verify(repository, never()).closeGame(1);
    }

    @Test void finalPlayerLeavingFinishedGameClosesIt() {
        GamePlayerRow leaving = player(10, 100, 1);
        prepareFinishedGame(leaving, List.of(), 100);
        service.leave(100, 1);
        verify(repository).closeGame(1);
    }

    @Test void playerLeavingActiveGameIsOnlyMarkedOfflineSoHistoryRemains() {
        GamePlayerRow leaving = player(10, 100, 1);
        when(repository.game(1, true)).thenReturn(Optional.of(game("PLAYING", 100)));
        when(repository.player(1, 100)).thenReturn(Optional.of(leaving));
        service.leave(100, 1);
        verify(repository).setPlayerOnline(10, false);
        verify(repository, never()).deleteGamePlayer(anyLong());
        verify(repository, never()).leaveGamePlayer(anyLong());
    }

    @Test void currentDoesNotReturnAnArchivedFinishedGeneration() {
        when(repository.activeGameForUser(100)).thenReturn(Optional.empty());

        assertNull(service.current(100));

        verify(repository, never()).game(anyLong(), anyBoolean());
    }

    private void prepareFinishedGame(GamePlayerRow leaving, List<GamePlayerRow> remaining, long owner) {
        when(repository.game(1, true)).thenReturn(Optional.of(game("FINISHED", owner)));
        when(repository.player(1, leaving.userId())).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(remaining);
    }
    private GameRow game(String status, long owner) {
        return new GameRow(1, "123456", owner, 5, "AVALON_V1", status, null, 1, 1,
                null, 0, 0, 0, null, null, null, null, null, null, null);
    }
    private GamePlayerRow player(long id, long userId, int seat) {
        return new GamePlayerRow(id, 1, userId, seat, "P" + seat, null, null, false, true, null);
    }
}
