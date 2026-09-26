package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
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

    @Test void inspectionPersistsOnlyAlignmentTransfersTokenAndAdvancesRound() {
        prepareLadyGame(2);

        GameService.LadyInspectionResult result = service.inspectWithLady(204, 50, 105);

        assertEquals("EVIL", result.alignment());
        assertFalse(result.toString().contains("MORDRED"));
        verify(repository).insertLadyAction(50, 2, 104, 105, Alignment.EVIL);
        verify(repository).updateLadyHolder(50, 105);
        verify(repository).advanceRound(50, 3, 102);
        verify(events).publish(50, "LADY_OF_LAKE_COMPLETED");
    }

    @Test void thirdGoodScoreTransitionsToAssassinationOnlyAfterLadyAction() {
        prepareLadyGame(3);

        service.inspectWithLady(204, 50, 105);

        var order = inOrder(repository);
        order.verify(repository).insertLadyAction(50, 2, 104, 105, Alignment.EVIL);
        order.verify(repository).updateLadyHolder(50, 105);
        order.verify(repository).setPhase(50, Phase.ASSASSINATION);
        verify(repository, never()).advanceRound(anyLong(), anyInt(), anyLong());
    }

    @Test void nonHolderAndHistoricalHolderTargetsAreRejected() {
        prepareLadyGame(2);
        GamePlayerRow nonHolder = player(103, 203, 3, Role.LOYAL_SERVANT);
        when(roomService.requirePlayer(50, 203)).thenReturn(nonHolder);
        assertEquals("FORBIDDEN", assertThrows(BusinessException.class,
                () -> service.inspectWithLady(203, 50, 105)).getCode());

        assertEquals("PARAM_ERROR", assertThrows(BusinessException.class,
                () -> service.inspectWithLady(204, 50, 103)).getCode());
        verify(repository, never()).insertLadyAction(eq(50L), anyInt(), eq(103L), anyLong(), any());
    }

    private void prepareLadyGame(int goodScore) {
        GameRow game = new GameRow(50, "123456", 201, 10, "AVALON_V1", "PLAYING", Phase.LADY_OF_LAKE,
                2, 1, 101L, 0, goodScore, 0, 104L, null, null, null, null, null, null);
        GamePlayerRow actor = player(104, 204, 4, Role.LOYAL_SERVANT);
        List<GamePlayerRow> players = java.util.stream.IntStream.rangeClosed(1, 10)
                .mapToObj(seat -> player(100 + seat, 200 + seat, seat, seat == 5 ? Role.MORDRED : Role.LOYAL_SERVANT)).toList();
        when(repository.game(50, true)).thenReturn(Optional.of(game));
        when(roomService.requirePlayer(50, 204)).thenReturn(actor);
        when(repository.ladyActionCount(50)).thenReturn(1);
        when(repository.ladyHolderHistory(50)).thenReturn(Set.of(103L));
        when(repository.gamePlayers(50)).thenReturn(players);
        when(repository.players(50)).thenReturn(players);
        when(repository.gamePlayerById(101)).thenReturn(Optional.of(players.getFirst()));
    }

    private GamePlayerRow player(long id, long userId, int seat, Role role) {
        return new GamePlayerRow(id, 50, userId, seat, "P" + seat, role, role.alignment(), true, true, null);
    }
}
