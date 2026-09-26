package com.avalon.game.room;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.realtime.RoomEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.util.List;

@Service
public class RoomService {
    private final AvalonRepository repository;
    private final RoomEventPublisher events;
    private final SecureRandom random = new SecureRandom();
    public RoomService(AvalonRepository repository, RoomEventPublisher events) { this.repository = repository; this.events = events; }

    @Transactional
    public RoomView create(long userId, int maxPlayers, String nickname) {
        com.avalon.game.game.GameRuleConfig.forPlayers(maxPlayers);
        ensureNoActiveRoom(userId);
        String name = normalizedNickname(nickname, repository.nickname(userId));
        for (int attempt = 0; attempt < 20; attempt++) {
            try {
                long roomId = repository.insertRoom(String.format("%06d", random.nextInt(1_000_000)), userId, maxPlayers);
                repository.insertPlayer(roomId, userId, name, 1, true);
                return get(userId, roomId);
            } catch (DuplicateKeyException ignored) { }
        }
        throw new BusinessException("房间号生成失败，请重试");
    }

    @Transactional
    public RoomView join(long userId, String code, String nickname) {
        if (code == null || !code.matches("\\d{6}")) throw new BusinessException("PARAM_ERROR", "请输入 6 位房间号");
        RoomRow room = repository.roomByCode(code, true).orElseThrow(() -> new BusinessException("NOT_FOUND", "房间不存在"));
        if (!"WAITING".equals(room.status())) throw new BusinessException("房间已开始或已关闭");
        var existing = repository.player(room.id(), userId);
        if (existing.isPresent()) { repository.setPlayerOnline(existing.get().id(), true); return get(userId, room.id()); }
        ensureNoActiveRoom(userId);
        List<PlayerRow> players = repository.players(room.id());
        if (players.size() >= room.maxPlayers()) throw new BusinessException("房间已满");
        repository.insertPlayer(room.id(), userId, normalizedNickname(nickname, repository.nickname(userId)), players.size() + 1, false);
        events.publish(room.id(), "PLAYER_JOINED");
        return get(userId, room.id());
    }

    @Transactional
    public void leave(long userId, long roomId) {
        RoomRow room = requireRoom(roomId, true);
        PlayerRow player = requirePlayer(roomId, userId);
        if ("PLAYING".equals(room.status())) {
            repository.setPlayerOnline(player.id(), false);
        } else if ("FINISHED".equals(room.status())) {
            repository.leavePlayer(player.id());
            List<PlayerRow> remaining = repository.players(roomId);
            if (remaining.isEmpty()) repository.closeRoom(roomId);
            else if (player.host()) {
                PlayerRow nextHost = remaining.stream().min(java.util.Comparator.comparingInt(PlayerRow::seatNo)).orElseThrow();
                repository.setHost(nextHost.id(), true);
                repository.updateRoomOwner(roomId, nextHost.userId());
            }
        } else if ("CLOSED".equals(room.status())) {
            repository.leavePlayer(player.id());
        } else {
            repository.deletePlayer(player.id());
            List<PlayerRow> remaining = repository.players(roomId);
            if (remaining.isEmpty()) repository.closeRoom(roomId);
            else {
                for (int i = 0; i < remaining.size(); i++) repository.reseat(remaining.get(i).id(), i + 1, i == 0);
                if (player.host()) repository.updateRoomOwner(roomId, remaining.getFirst().userId());
            }
        }
        events.publish(roomId, "PLAYER_LEFT");
    }

    @Transactional(readOnly = true)
    public RoomView current(long userId) {
        RoomRow room = repository.activeRoomForUser(userId).orElse(null);
        return room == null ? null : get(userId, room.id());
    }

    @Transactional(readOnly = true)
    public RoomView get(long userId, long roomId) {
        RoomRow room = requireRoom(roomId, false);
        PlayerRow me = requirePlayer(roomId, userId);
        List<PlayerView> players = repository.players(roomId).stream()
                .map(p -> new PlayerView(p.id(), p.userId() == userId, p.nickname(), p.seatNo(), p.host(), p.online())).toList();
        return new RoomView(room.id(), room.code(), room.maxPlayers(), room.status(), room.currentGameId(), room.ownerUserId() == userId,
                me.id(), players.size(), players, players.size() == room.maxPlayers() && room.ownerUserId() == userId);
    }

    public RoomRow requireRoom(long id, boolean lock) { return repository.room(id, lock).orElseThrow(() -> new BusinessException("NOT_FOUND", "房间不存在")); }
    public PlayerRow requirePlayer(long roomId, long userId) { return repository.player(roomId, userId).orElseThrow(() -> new BusinessException("FORBIDDEN", "你不在此房间")); }
    private void ensureNoActiveRoom(long userId) { if (repository.activeRoomForUser(userId).isPresent()) throw new BusinessException("你已有进行中的房间"); }
    private String normalizedNickname(String requested, String fallback) {
        String value = StringUtils.hasText(requested) ? requested.trim() : StringUtils.hasText(fallback) ? fallback.trim() : "玩家";
        return value.length() > 32 ? value.substring(0, 32) : value;
    }

    public record CreateRequest(int maxPlayers, String nickname) {}
    public record JoinRequest(String roomCode, String nickname) {}
    public record PlayerView(long playerId, boolean me, String nickname, int seatNo, boolean host, boolean online) {}
    public record RoomView(long roomId, String roomCode, int maxPlayers, String status, Long currentGameId, boolean host,
                           long myPlayerId, int currentPlayers, List<PlayerView> players, boolean canStart) {}
}
