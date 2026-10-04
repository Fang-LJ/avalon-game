package com.avalon.game.game;

import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FinishedIdentityTest {
    @Test void finishedStateReturnsAvatarBotFlagAndSeatOrderedIdentitiesFromOneQuery() throws Exception {
        AvalonRepository repository = mock(AvalonRepository.class);
        var service = service(repository, Phase.FINISHED);
        when(repository.gamePlayerIdentities(1)).thenReturn(List.of(
                new GamePlayerIdentityRow(12, 2, "机器人", null, Role.ASSASSIN, Alignment.EVIL, true),
                new GamePlayerIdentityRow(11, 1, "昵称快照", "https://images.example/avatar.png", Role.MERLIN, Alignment.GOOD, false)));
        var state = service.state(101, 1);
        assertEquals(List.of(1,2), state.identities().stream().map(GameService.PublicIdentity::seatNo).toList());
        assertEquals("https://images.example/avatar.png", state.identities().getFirst().avatarUrl());
        assertEquals("昵称快照", state.identities().getFirst().nickname());
        assertTrue(state.identities().getLast().isBot());
        assertNull(state.identities().getLast().avatarUrl());
        assertTrue(new ObjectMapper().writeValueAsString(state).contains("\"avatarUrl\":\"https://images.example/avatar.png\""));
        verify(repository, times(1)).gamePlayerIdentities(1);
        verify(repository, never()).gamePlayers(anyLong());
        verify(repository, never()).user(anyLong());
    }

    @ParameterizedTest @EnumSource(value = Phase.class, names = "FINISHED", mode = EnumSource.Mode.EXCLUDE)
    void playingPhasesNeverReadOrPublishPublicIdentities(Phase phase) {
        AvalonRepository repository = mock(AvalonRepository.class);
        assertTrue(service(repository, phase).state(101,1).identities().isEmpty());
        verify(repository, never()).gamePlayerIdentities(anyLong());
        verify(repository, never()).user(anyLong());
    }

    @Test void identityRepositoryIncludesLeftParticipantsAndUsesCurrentAvatarWithSnapshotNickname() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:identities-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(ds);
        try {
            jdbc.execute("create table t_avalon_user(id bigint primary key, provider varchar(20), nickname varchar(100), avatar_url varchar(500))");
            jdbc.execute("create table t_avalon_game_player(id bigint primary key, game_id bigint,user_id bigint,seat_no tinyint,nickname_snapshot varchar(100),role_code varchar(40),alignment varchar(10),left_at timestamp)");
            jdbc.update("insert into t_avalon_user values(101,'WECHAT','当前昵称','https://images.example/new.png'),(102,'BOT','机器人',null),(103,'WECHAT','其他对局',null)");
            jdbc.update("insert into t_avalon_game_player values(11,1,101,1,'当局昵称','MERLIN','GOOD',CURRENT_TIMESTAMP),(12,1,102,2,'机器人1','ASSASSIN','EVIL',null),(13,2,103,1,'其他对局','MERLIN','GOOD',null)");
            var identities = new AvalonRepository(jdbc).gamePlayerIdentities(1);
            assertEquals(2, identities.size());
            assertEquals(11, identities.getFirst().id());
            assertEquals("当局昵称", identities.getFirst().nickname());
            assertEquals("https://images.example/new.png", identities.getFirst().avatarUrl());
            assertTrue(identities.getLast().isBot());
        } finally { jdbc.execute("shutdown"); }
    }

    @Test void repositoryIdentityReadIsOneJoinWithoutLeftFilterOrPerUserQueries() {
        var jdbc = mock(JdbcTemplate.class);
        new AvalonRepository(jdbc).gamePlayerIdentities(1);
        var sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(1)).query(sql.capture(), org.mockito.ArgumentMatchers.<RowMapper<GamePlayerIdentityRow>>any(), eq(1L));
        assertTrue(sql.getValue().contains("join t_avalon_user u on u.id=gp.user_id"));
        assertFalse(sql.getValue().contains("left_at"));
        verifyNoMoreInteractions(jdbc);
    }

    private GameService service(AvalonRepository repository, Phase phase) {
        var rooms = mock(RoomService.class);
        var player = new GamePlayerRow(11,1,101,1,"玩家",Role.MERLIN,Alignment.GOOD,true,true,null);
        var game = new GameRow(1,"123456",101,5,"AVALON_V1",phase == Phase.FINISHED ? "FINISHED" : "PLAYING",
                phase,1,1,11L,0,0,0,null,null,"HOST_ENDED",null,null,null,null);
        when(repository.game(1,false)).thenReturn(Optional.of(game));
        when(rooms.requirePlayer(1,101)).thenReturn(player);
        when(repository.players(1)).thenReturn(List.of(player));
        when(repository.gamePlayerById(11)).thenReturn(Optional.of(player));
        return new GameService(repository, rooms, new RoleVisibilityService(), mock(RoomEventPublisher.class));
    }
}
