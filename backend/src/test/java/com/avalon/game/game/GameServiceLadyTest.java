package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.game.AvalonRepository.PlayerRow;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameServiceLadyTest {
    private AvalonRepository repository;
    private RoomService roomService;
    private RoomEventPublisher events;
    private GameService service;

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        roomService = mock(RoomService.class);
        events = mock(RoomEventPublisher.class);
        service = new GameService(repository, roomService, new RoleVisibilityService(), events);
    }

    @Test void inspectionReturnsOnlyAlignmentTransfersTokenAndAdvancesRound() {
        prepareLadyGame(2);

        GameService.LadyInspectionResult result = service.inspectWithLady(204, 50, 105);

        assertEquals("EVIL", result.alignment());
        assertFalse(result.toString().contains("MORDRED"));
        verify(repository).insertLadyInspection(50, 2, 104, 105, Alignment.EVIL);
        verify(repository).updateLadyHolder(50, 105);
        verify(repository).advanceRound(50, 3, 102);
        verify(events).publish(1, "LADY_OF_LAKE_COMPLETED");
    }

    @Test void thirdGoodScoreTransitionsToAssassinationOnlyAfterInspection() {
        prepareLadyGame(3);

        service.inspectWithLady(204, 50, 105);

        var order = inOrder(repository);
        order.verify(repository).insertLadyInspection(50, 2, 104, 105, Alignment.EVIL);
        order.verify(repository).updateLadyHolder(50, 105);
        order.verify(repository).setPhase(50, Phase.ASSASSINATION);
        verify(repository, never()).advanceRound(anyLong(), anyInt(), anyLong());
    }

    @Test void nonHolderCannotInspectOrTransferTheToken() {
        prepareLadyGame(2);
        when(roomService.requirePlayer(1, 203)).thenReturn(player(103, 203, 3));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.inspectWithLady(203, 50, 105));

        assertEquals("FORBIDDEN", error.getCode());
        verify(repository, never()).insertLadyInspection(anyLong(), anyInt(), anyLong(), anyLong(), any());
        verify(repository, never()).updateLadyHolder(anyLong(), anyLong());
    }

    private void prepareLadyGame(int goodScore) {
        GameRow game = new GameRow(50, 1, 2, 101, 104L, 1, 0, goodScore, 0, Phase.LADY_OF_LAKE, null);
        PlayerRow actor = player(104, 204, 4);
        PlayerRow target = player(105, 205, 5);
        List<PlayerRow> players = java.util.stream.IntStream.rangeClosed(1, 10)
                .mapToObj(seat -> player(100 + seat, 200 + seat, seat)).toList();
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(1, 204)).thenReturn(actor);
        when(repository.ladyInspectionCount(50)).thenReturn(1);
        when(repository.ladyHolderHistory(50)).thenReturn(Set.of(103L));
        when(repository.gamePlayers(50)).thenReturn(List.of(
                new GamePlayerRow(1, 50, 104, Role.LOYAL_SERVANT, Alignment.GOOD, true),
                new GamePlayerRow(2, 50, 105, Role.MORDRED, Alignment.EVIL, true)));
        when(repository.playerById(105)).thenReturn(Optional.of(target));
        when(repository.playerById(101)).thenReturn(Optional.of(players.getFirst()));
        when(repository.players(1)).thenReturn(players);
    }

    private PlayerRow player(long id, long userId, int seat) {
        return new PlayerRow(id, 1, userId, "P" + seat, seat, false, true);
    }
}
