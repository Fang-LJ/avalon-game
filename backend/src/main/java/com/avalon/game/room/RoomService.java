package com.avalon.game.room;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.realtime.RoomEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.util.Comparator;
import java.util.List;

@Service
public class RoomService {
    private final AvalonRepository repository;
    private final RoomEventPublisher events;
    private final SecureRandom random = new SecureRandom();

    public RoomService(AvalonRepository repository, RoomEventPublisher events) {
        this.repository = repository; this.events = events;
    }

    @Transactional
    public RoomView create(long userId, int maxPlayers, String nickname) {
        com.avalon.game.game.GameRuleConfig.forPlayers(maxPlayers);
        ensureNoActiveRoom(userId);
        String name = normalizedNickname(nickname, repository.nickname(userId));
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = String.format("%06d", random.nextInt(1_000_000));
            if (repository.waitingRoomCodeExists(code)) continue;
            long gameId = repository.insertWaitingGame(code, userId, maxPlayers);
            repository.insertGamePlayer(gameId, userId, name, 1);
            return get(userId, gameId);
        }
        throw new BusinessException("房间号生成失败，请重试");
    }

    @Transactional
    public RoomView join(long userId, String code, String nickname) {
        if (code == null || !code.matches("\\d{6}")) throw new BusinessException("PARAM_ERROR", "请输入 6 位房间号");
        GameRow game = repository.waitingGameByCode(code, true)
                .orElseThrow(() -> new BusinessException("NOT_FOUND", "房间不存在"));
        var existing = repository.player(game.id(), userId);
        if (existing.isPresent()) {
            repository.setPlayerOnline(existing.get().id(), true);
            return get(userId, game.id());
        }
        ensureNoActiveRoom(userId);
        List<GamePlayerRow> players = repository.players(game.id());
        if (players.size() >= game.playerCount()) throw new BusinessException("房间已满");
        repository.insertGamePlayer(game.id(), userId, normalizedNickname(nickname, repository.nickname(userId)), players.size() + 1);
        events.publish(game.id(), "PLAYER_JOINED");
        return get(userId, game.id());
    }

    @Transactional
    public void leave(long userId, long roomId) {
        GameRow game = requireRoom(roomId, true);
        GamePlayerRow player = requirePlayer(roomId, userId);
        if ("PLAYING".equals(game.status())) {
            repository.setPlayerOnline(player.id(), false);
        } else if ("FINISHED".equals(game.status())) {
            repository.leaveGamePlayer(player.id());
            transferOrClose(game, player.userId());
        } else if ("CLOSED".equals(game.status())) {
            repository.leaveGamePlayer(player.id());
        } else {
            repository.deleteGamePlayer(player.id());
            List<GamePlayerRow> remaining = repository.players(roomId);
            if (remaining.isEmpty()) repository.closeGame(roomId);
            else {
                for (int i = 0; i < remaining.size(); i++) repository.reseat(remaining.get(i).id(), i + 1);
                if (game.ownerUserId() == player.userId()) repository.updateGameOwner(roomId, remaining.getFirst().userId());
            }
        }
        events.publish(roomId, "PLAYER_LEFT");
    }

    private void transferOrClose(GameRow game, long leavingUserId) {
        List<GamePlayerRow> remaining = repository.players(game.id());
        if (remaining.isEmpty()) repository.closeGame(game.id());
        else if (game.ownerUserId() == leavingUserId) {
            GamePlayerRow nextHost = remaining.stream().min(Comparator.comparingInt(GamePlayerRow::seatNo)).orElseThrow();
            repository.updateGameOwner(game.id(), nextHost.userId());
        }
    }

    @Transactional(readOnly = true)
    public RoomView current(long userId) {
        GameRow game = repository.activeGameForUser(userId).orElse(null);
        return game == null ? null : get(userId, game.id());
    }

    @Transactional(readOnly = true)
    public RoomView get(long userId, long roomId) {
        GameRow game = requireRoom(roomId, false);
        if ("FINISHED".equals(game.status()) || "CLOSED".equals(game.status())) {
            GameRow latest = repository.latestGameForRoomCodeAndUser(game.code(), userId).orElse(game);
            if (latest.id() > game.id()) game = latest;
        }
        GameRow selectedGame = game;
        GamePlayerRow me = requirePlayer(selectedGame.id(), userId);
        List<PlayerView> players = repository.players(selectedGame.id()).stream()
                .map(p -> new PlayerView(p.id(), p.userId() == userId, p.nickname(), p.seatNo(),
                        p.userId() == selectedGame.ownerUserId(), p.online())).toList();
        Long currentGameId = "WAITING".equals(selectedGame.status()) ? null : selectedGame.id();
        return new RoomView(selectedGame.id(), selectedGame.code(), selectedGame.playerCount(), selectedGame.status(), currentGameId,
                selectedGame.ownerUserId() == userId, me.id(), players.size(), players,
                players.size() == selectedGame.playerCount() && selectedGame.ownerUserId() == userId && "WAITING".equals(selectedGame.status()));
    }

    public GameRow requireRoom(long id, boolean lock) {
        return repository.game(id, lock).orElseThrow(() -> new BusinessException("NOT_FOUND", "房间不存在"));
    }
    public GamePlayerRow requirePlayer(long gameId, long userId) {
        return repository.player(gameId, userId).orElseThrow(() -> new BusinessException("FORBIDDEN", "你不在此房间"));
    }
    private void ensureNoActiveRoom(long userId) {
        if (repository.activeGameForUser(userId).isPresent()) throw new BusinessException("你已有进行中的房间");
    }
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
