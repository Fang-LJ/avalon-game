package com.avalon.game.auth;

import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.UserRow;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class AuthServicePersistenceTest {
    @Test void localIdentityIsReadAndInsertedDirectlyInUserTableModel() {
        AvalonRepository repository = mock(AvalonRepository.class);
        JwtService jwt = mock(JwtService.class);
        WechatIdentityResolver resolver = mock(WechatIdentityResolver.class);
        when(resolver.resolve(null, "avalon_mock_1")).thenReturn(new ResolvedIdentity("LOCAL", "avalon_mock_1"));
        when(repository.user("LOCAL", "avalon_mock_1")).thenReturn(Optional.empty());
        when(repository.insertUser("LOCAL", "avalon_mock_1", "玩家一")).thenReturn(7L);
        when(repository.nickname(7)).thenReturn("玩家一");
        when(jwt.create(7L)).thenReturn("token");

        AuthService.LoginResult result = new AuthService(repository, jwt, resolver)
                .login(new AuthService.LoginRequest(null, "avalon_mock_1", "玩家一"));

        assertEquals(7, result.userId());
        verify(repository).user("LOCAL", "avalon_mock_1");
        verify(repository).insertUser("LOCAL", "avalon_mock_1", "玩家一");
    }

    @Test void wechatIdentityUsesExistingDirectUserRecord() {
        AvalonRepository repository = mock(AvalonRepository.class);
        JwtService jwt = mock(JwtService.class);
        WechatIdentityResolver resolver = mock(WechatIdentityResolver.class);
        when(resolver.resolve("wx-code", null)).thenReturn(new ResolvedIdentity("WECHAT", "openid-1"));
        when(repository.user("WECHAT", "openid-1")).thenReturn(Optional.of(new UserRow(8, "WECHAT", "openid-1", "微信玩家", null)));
        when(repository.nickname(8)).thenReturn("微信玩家");

        new AuthService(repository, jwt, resolver).login(new AuthService.LoginRequest("wx-code", null, null));

        verify(repository).user("WECHAT", "openid-1");
        verify(repository, never()).insertUser(anyString(), anyString(), anyString());
    }
}
