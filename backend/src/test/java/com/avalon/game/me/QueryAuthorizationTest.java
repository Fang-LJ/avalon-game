package com.avalon.game.me;

import com.avalon.game.auth.AuthInterceptor;
import com.avalon.game.auth.JwtService;
import com.avalon.game.common.GlobalExceptionHandler;
import com.avalon.game.game.GameHistoryController;
import com.avalon.game.game.GameHistoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class QueryAuthorizationTest {
    MockMvc mvc; MeService me; GameHistoryService history; JwtService jwt;
    @BeforeEach void setup() {
        me=mock(MeService.class);history=mock(GameHistoryService.class);jwt=mock(JwtService.class);
        when(jwt.parse("valid")).thenReturn(101L);
        mvc=MockMvcBuilders.standaloneSetup(new MeController(me),new GameHistoryController(history))
                .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new AuthInterceptor(jwt)).build();
    }
    @ParameterizedTest @ValueSource(strings={"/api/avalon/me/profile","/api/avalon/me/games","/api/avalon/me/stats","/api/avalon/game/1/timeline","/api/avalon/game/1/replay"})
    void everyReadRequiresLogin(String url) throws Exception {
        mvc.perform(get(url)).andExpect(status().isUnauthorized());verifyNoInteractions(me,history);
    }
    @Test void callerCannotOverrideHistoryUserWithQueryParameter() throws Exception {
        mvc.perform(get("/api/avalon/me/games?userId=999&page=2&size=5&alignment=GOOD").header("Authorization","Bearer valid"))
                .andExpect(status().isOk());verify(me).games(101,2,5,"GOOD");
    }
    @Test void replayAndTimelineReceiveOnlyAuthenticatedUser() throws Exception {
        mvc.perform(get("/api/avalon/game/7/replay?userId=999").header("Authorization","Bearer valid")).andExpect(status().isOk());
        mvc.perform(get("/api/avalon/game/7/timeline?userId=999").header("Authorization","Bearer valid")).andExpect(status().isOk());
        verify(history).replay(101,7);verify(history).timeline(101,7);
    }
}
