package com.avalon.game.room;

import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.PlayerRow;
import com.avalon.game.game.AvalonRepository.RoomRow;
import com.avalon.game.realtime.RoomEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;

class RoomServiceTest {
    private AvalonRepository repository;
    private RoomService service;

    @BeforeEach void setUp() {
        repository = mock(AvalonRepository.class);
        service = new RoomService(repository, mock(RoomEventPublisher.class));
    }

    @Test void ordinaryPlayerLeavingFinishedRoomDoesNotCloseIt() {
        PlayerRow leaving = player(10, 100, 3, false);
        prepareFinishedRoom(leaving, List.of(player(11, 101, 1, true), player(12, 102, 2, false)));
        service.leave(100, 1);
        verify(repository).leavePlayer(10);
        verify(repository, never()).closeRoom(1);
        verify(repository, never()).updateRoomOwner(anyLong(), anyLong());
    }

    @Test void hostLeavingFinishedRoomTransfersOwnershipToLowestRemainingSeatWithoutReseating() {
        PlayerRow leaving = player(10, 100, 1, true);
        prepareFinishedRoom(leaving, List.of(player(12, 102, 4, false), player(11, 101, 2, false)));
        service.leave(100, 1);
        verify(repository).setHost(11, true);
        verify(repository).updateRoomOwner(1, 101);
        verify(repository, never()).reseat(anyLong(), anyInt(), anyBoolean());
        verify(repository, never()).closeRoom(1);
    }

    @Test void finalPlayerLeavingFinishedRoomClosesIt() {
        PlayerRow leaving = player(10, 100, 1, true);
        prepareFinishedRoom(leaving, List.of());
        service.leave(100, 1);
        verify(repository).closeRoom(1);
    }

    private void prepareFinishedRoom(PlayerRow leaving, List<PlayerRow> remaining) {
        when(repository.room(1, true)).thenReturn(Optional.of(new RoomRow(1, "123456", 100, 10, "FINISHED", 5L, LocalDateTime.now(), LocalDateTime.now())));
        when(repository.player(1, 100)).thenReturn(Optional.of(leaving));
        when(repository.players(1)).thenReturn(remaining);
    }
    private PlayerRow player(long id, long userId, int seat, boolean host) { return new PlayerRow(id, 1, userId, "P" + seat, seat, host, true); }
}
