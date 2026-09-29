package com.avalon.game.me;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.GameTypes.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MeServiceTest {
    AvalonRepository repository; JdbcTemplate jdbc; MeService service;
    @BeforeEach void setup() {
        repository=mock(AvalonRepository.class);jdbc=mock(JdbcTemplate.class);service=new MeService(repository,jdbc);
        when(repository.user(101)).thenReturn(Optional.of(new AvalonRepository.UserRow(101,"WECHAT","private-openid","昵称","https://avatar.invalid/a.png")));
    }
    @Test void profileContainsOnlyPublicAccountFields() throws Exception {
        var result=service.profile(101);
        assertEquals(101,result.userId());assertEquals("昵称",result.nickname());assertNotNull(result.avatarUrl());
        assertTrue(result.profileComplete());
        String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(result);
        assertTrue(json.contains("\"profileComplete\":true"));
        assertFalse(json.contains("openid"));assertFalse(json.contains("provider"));
    }
    @Test void missingAccountRequiresLogin() { assertThrows(BusinessException.class,()->service.profile(999)); }
    @Test void nicknameAndAvatarUpdateTogether() {
        when(repository.user(101)).thenReturn(
                Optional.of(new AvalonRepository.UserRow(101,"WECHAT","private-openid","旧昵称","https://avatar.invalid/old.png")),
                Optional.of(new AvalonRepository.UserRow(101,"WECHAT","private-openid","新昵称","https://avatar.invalid/new.png")));
        var result=service.updateProfile(101,new MeService.ProfileUpdateRequest("  新昵称  "," https://avatar.invalid/new.png "));
        verify(repository).updateNickname(101,"新昵称");verify(repository).updateAvatar(101,"https://avatar.invalid/new.png");
        assertEquals("新昵称",result.nickname());assertEquals("https://avatar.invalid/new.png",result.avatarUrl());verifyNoInteractions(jdbc);
    }
    @Test void nicknameOnlyUpdateKeepsAvatarUntouched() {
        service.updateProfile(101,new MeService.ProfileUpdateRequest("新昵称",null));
        verify(repository).updateNickname(101,"新昵称");verify(repository,never()).updateAvatar(anyLong(),anyString());
    }
    @Test void avatarOnlyUpdateKeepsNicknameUntouched() {
        service.updateProfile(101,new MeService.ProfileUpdateRequest(null,"https://avatar.invalid/new.png"));
        verify(repository).updateAvatar(101,"https://avatar.invalid/new.png");verify(repository,never()).updateNickname(anyLong(),anyString());
    }
    @Test void oldProfileWithoutAvatarIsIncomplete() {
        when(repository.user(102)).thenReturn(Optional.of(new AvalonRepository.UserRow(102,"WECHAT","old","微信玩家",null)));
        assertFalse(service.profile(102).profileComplete());
    }
    @Test void invalidNicknameRejected() {
        for(String name:List.of(""," ","a".repeat(33),"bad\nname"))assertThrows(BusinessException.class,
                ()->service.updateProfile(101,new MeService.ProfileUpdateRequest(name,null)));
        verify(repository,never()).updateNickname(anyLong(),anyString());
    }
    @Test void invalidPaginationOrAlignmentRejectedBeforeSql() {
        assertThrows(BusinessException.class,()->service.games(101,0,10,null));
        assertThrows(BusinessException.class,()->service.games(101,1,51,null));
        assertThrows(BusinessException.class,()->service.games(101,1,10,"GOOD' OR 1=1"));
        verifyNoInteractions(jdbc);
    }
    @Test void historyScopesUserAndIncludesArchivedAndClosedFinishedGames() throws Exception {
        when(jdbc.queryForObject(anyString(),eq(Long.class),eq(101L),eq("GOOD"))).thenReturn(1L);
        when(jdbc.query(anyString(),any(RowMapper.class),eq(101L),eq("GOOD"),eq(10),eq(10))).thenAnswer(inv->{
            String sql=inv.getArgument(0);assertTrue(sql.contains("p.user_id=?"));assertTrue(sql.contains("g.phase='FINISHED'"));
            assertTrue(sql.contains("'CLOSED'"));assertFalse(sql.contains("left_at"));assertTrue(sql.contains("p.alignment=?"));
            ResultSet rs=mock(ResultSet.class);when(rs.getLong("id")).thenReturn(7L);when(rs.getInt("player_count")).thenReturn(5);
            when(rs.getString("role_code")).thenReturn("MERLIN");when(rs.getString("alignment")).thenReturn("GOOD");
            when(rs.getString("winner_alignment")).thenReturn("GOOD");
            RowMapper<MeService.HistoryGame> mapper=inv.getArgument(1);return List.of(mapper.mapRow(rs,0));
        });
        var page=service.games(101,2,10,"GOOD");assertEquals(1,page.total());assertEquals(7,page.items().getFirst().gameId());
        assertTrue(page.items().getFirst().won());assertEquals("梅林",page.items().getFirst().roleName());
    }
    @Test void statisticsAggregateOnlyOwnFinishedGamesAndHandleBothSides() {
        when(jdbc.query(anyString(),any(RowMapper.class),eq(101L))).thenAnswer(inv->{
            String sql=inv.getArgument(0);assertTrue(sql.contains(MeService.FINISHED_FROM));assertFalse(sql.contains("left_at"));
            return List.of(new MeService.RoleCount(Role.MERLIN,"梅林",Alignment.GOOD,3,2),new MeService.RoleCount(Role.ASSASSIN,"刺客",Alignment.EVIL,2,1));
        });
        var stats=service.stats(101);assertEquals(5,stats.totalGames());assertEquals(3,stats.wins());assertEquals(2,stats.losses());
        assertEquals(60,stats.winRate());assertEquals(3,stats.goodGames());assertEquals(2,stats.goodWins());assertEquals(2,stats.evilGames());assertEquals(1,stats.evilWins());
    }
    @Test void noGamesMeansZeroNotNaNWinRate() { assertEquals(0,service.stats(101).winRate()); }
}
