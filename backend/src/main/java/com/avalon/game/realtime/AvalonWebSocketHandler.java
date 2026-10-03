package com.avalon.game.realtime;

import com.avalon.game.auth.JwtService;
import com.avalon.game.game.AvalonRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AvalonWebSocketHandler extends TextWebSocketHandler {
    private final JwtService jwtService;
    private final AvalonRepository repository;
    private final ObjectMapper objectMapper;
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    public AvalonWebSocketHandler(JwtService jwtService, AvalonRepository repository, ObjectMapper objectMapper) {
        this.jwtService = jwtService; this.repository = repository; this.objectMapper = objectMapper;
    }
    @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            String authorization = session.getHandshakeHeaders().getFirst("Authorization");
            String token = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7).trim() : queryParameter(session, "token");
            long userId = jwtService.parse(token);
            var game = repository.activeGameForUser(userId).orElse(null);
            if (game == null) { session.close(CloseStatus.POLICY_VIOLATION.withReason("no active game")); return; }
            var player = repository.player(game.id(), userId).orElseThrow();
            clients.put(session.getId(), new Client(session, userId, game.id(), player.id()));
            repository.setPlayerOnline(player.id(), true);
            send(session, game.id(), "CONNECTED");
            broadcast(game.id(), "PLAYER_RECONNECTED");
        } catch (RuntimeException e) { session.close(CloseStatus.POLICY_VIOLATION.withReason("invalid token")); }
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Client removed = clients.remove(session.getId());
        if (removed != null && clients.values().stream().noneMatch(c -> c.userId == removed.userId && c.roomId == removed.roomId)) {
            repository.setPlayerOnline(removed.playerId, false);
            broadcast(removed.roomId, "PLAYER_DISCONNECTED");
        }
    }
    @Override public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        if (session.isOpen()) session.close(CloseStatus.SERVER_ERROR);
    }
    @EventListener public void onRoomEvent(RoomEventPublisher.RoomEvent event) {
        if ("REMATCH_CREATED".equals(event.type())) {
            clients.values().stream().filter(c -> c.roomId == event.roomId() && c.session.isOpen()).forEach(c -> {
                repository.activeGameForUser(c.userId).ifPresent(game -> repository.player(game.id(), c.userId).ifPresent(player -> {
                    clients.put(c.session.getId(), new Client(c.session, c.userId, game.id(), player.id()));
                    try { send(c.session, game.id(), event.type()); } catch (Exception ignored) { }
                }));
            });
            return;
        }
        broadcast(event.roomId(), event.type());
        if ("GAME_RESTARTED".equals(event.type())) {
            clients.values().stream().filter(c -> c.roomId == event.roomId() && c.session.isOpen()).forEach(c -> {
                try { c.session.close(CloseStatus.NORMAL); } catch (Exception ignored) { }
            });
        }
    }
    private void broadcast(long roomId, String type) {
        clients.values().stream().filter(c -> c.roomId == roomId && c.session.isOpen()).forEach(c -> {
            try { send(c.session, roomId, type); } catch (Exception ignored) { }
        });
    }
    private void send(WebSocketSession session, long roomId, String type) throws Exception {
        synchronized (session) {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(Map.of("type", type, "roomId", roomId, "at", Instant.now().toString()))));
        }
    }
    private String queryParameter(WebSocketSession session, String name) {
        String query = session.getUri() == null ? null : session.getUri().getRawQuery();
        if (query == null) throw new IllegalArgumentException();
        for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2 && pair[0].equals(name)) return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
        }
        throw new IllegalArgumentException();
    }
    private record Client(WebSocketSession session, long userId, long roomId, long playerId) {}
}
