package com.avalon.game.bot;

import com.avalon.game.auth.*;
import com.avalon.game.common.GlobalExceptionHandler;
import com.avalon.game.game.*;
import com.avalon.game.room.*;
import org.junit.jupiter.api.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BotApiAuthorizationTest {
    MockMvc mvc; RoomService rooms; GameService games;
    @BeforeEach void setup() {
        rooms=mock(RoomService.class); games=mock(GameService.class);
        JwtService jwt=mock(JwtService.class); when(jwt.parse("valid")).thenReturn(101L);
        mvc=MockMvcBuilders.standaloneSetup(new RoomController(rooms),new GameController(games))
                .setControllerAdvice(new GlobalExceptionHandler()).addInterceptors(new AuthInterceptor(jwt)).build();
    }
    @Test void everyNewWriteEndpointRequiresLogin() throws Exception {
        mvc.perform(post("/api/avalon/room/7/bots")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/avalon/room/7/bots/3")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/avalon/game/7/end")).andExpect(status().isUnauthorized());
        verifyNoInteractions(rooms,games);
    }
    @Test void endpointsUseAuthenticatedIdentityNotCallerSuppliedUserId() throws Exception {
        mvc.perform(post("/api/avalon/room/7/bots?userId=999").header("Authorization","Bearer valid")).andExpect(status().isOk());
        mvc.perform(delete("/api/avalon/room/7/bots/3?userId=999").header("Authorization","Bearer valid")).andExpect(status().isOk());
        when(games.end(101,7)).thenReturn(new GameService.EndResult(true));
        mvc.perform(post("/api/avalon/game/7/end?userId=999").header("Authorization","Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.closed").value(true));
        verify(rooms).addBot(101,7); verify(rooms).removeBot(101,7,3); verify(games).end(101,7);
    }
}
