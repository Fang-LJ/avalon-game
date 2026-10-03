package com.avalon.game.bot;

import com.avalon.game.auth.JwtService;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.realtime.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.*;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class BotRematchWebSocketTest {
    @Test void rematchChangesSocketSubscriptionAndNotifiesClientsOfNewRoom() throws Exception {
        JwtService jwt=mock(JwtService.class); AvalonRepository repository=mock(AvalonRepository.class);
        WebSocketSession session=mock(WebSocketSession.class);
        HttpHeaders headers=new HttpHeaders(); headers.set("Authorization","Bearer valid");
        when(session.getId()).thenReturn("session"); when(session.isOpen()).thenReturn(true);
        when(session.getHandshakeHeaders()).thenReturn(headers); when(jwt.parse("valid")).thenReturn(101L);
        when(repository.activeGameForUser(101)).thenReturn(Optional.of(game(50)));
        when(repository.player(50,101)).thenReturn(Optional.of(player(500,50)));
        AvalonWebSocketHandler handler=new AvalonWebSocketHandler(jwt,repository,new ObjectMapper());
        handler.afterConnectionEstablished(session);
        clearInvocations(session);
        // The old test game has already been deleted when its event is delivered after commit.
        when(repository.activeGameForUser(101)).thenReturn(Optional.of(game(51)));
        when(repository.player(51,101)).thenReturn(Optional.of(player(501,51)));
        handler.onRoomEvent(new RoomEventPublisher.RoomEvent(50,"REMATCH_CREATED"));
        var messages=org.mockito.ArgumentCaptor.forClass(WebSocketMessage.class);
        verify(session).sendMessage(messages.capture());
        var json=new ObjectMapper().readTree(messages.getValue().getPayload().toString());
        assertEquals(51,json.get("roomId").asLong()); assertEquals("REMATCH_CREATED",json.get("type").asText());
        assertFalse(json.has("role")); assertFalse(json.has("alignment"));
        clearInvocations(session);
        handler.onRoomEvent(new RoomEventPublisher.RoomEvent(51,"BOT_ADDED"));
        verify(session).sendMessage(any());
        clearInvocations(session);
        handler.onRoomEvent(new RoomEventPublisher.RoomEvent(50,"ROOM_CLOSED"));
        verify(session,never()).sendMessage(any());
        handler.afterConnectionClosed(session,CloseStatus.NORMAL);
        verify(repository).setPlayerOnline(501,false);
    }
    private GameRow game(long id) {
        return new GameRow(id,"123456",101,5,"AVALON_V1","WAITING",null,1,1,null,0,0,0,null,null,null,null,null,null,null);
    }
    private GamePlayerRow player(long id,long game) {
        return new GamePlayerRow(id,game,101,1,"房主",null,null,false,true,null);
    }
}
