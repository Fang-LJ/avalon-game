package com.avalon.game.room;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.GamePlayerRow;
import com.avalon.game.game.AvalonRepository.GameRow;
import com.avalon.game.realtime.RoomEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.dao.DuplicateKeyException;

import java.security.SecureRandom;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

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
        String name = normalizedNickname(null, repository.nickname(userId));
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
        int seatNo = firstEmptySeat(players, game.playerCount());
        try {
            repository.insertGamePlayer(game.id(), userId, normalizedNickname(null, repository.nickname(userId)), seatNo);
        } catch (DuplicateKeyException exception) {
            throw seatTaken();
        }
        events.publish(game.id(), "PLAYER_JOINED");
        return get(userId, game.id());
    }

    @Transactional
    public RoomView seat(long userId, long roomId, Integer seatNo) {
        GameRow game = requireRoom(roomId, true);
        requireWaiting(game);
        if (seatNo == null || seatNo < 1 || seatNo > game.playerCount())
            throw new BusinessException("PARAM_ERROR", "座位号不正确");
        GamePlayerRow player = requirePlayer(roomId, userId);
        if (seatNo.equals(player.seatNo())) return get(userId, roomId);
        boolean occupied = repository.players(roomId).stream()
                .anyMatch(p -> p.id() != player.id() && seatNo.equals(p.seatNo()));
        if (occupied) throw seatTaken();
        try {
            repository.updateSeat(player.id(), seatNo);
        } catch (DuplicateKeyException exception) {
            throw seatTaken();
        }
        events.publish(roomId, player.seatNo() == null ? "PLAYER_SEATED" : "PLAYER_MOVED");
        return get(userId, roomId);
    }

    @Transactional
    public RoomView stand(long userId, long roomId) {
        GameRow game = requireRoom(roomId, true);
        requireWaiting(game);
        GamePlayerRow player = requirePlayer(roomId, userId);
        if (player.seatNo() != null) {
            repository.updateSeat(player.id(), null);
            events.publish(roomId, "PLAYER_STOOD");
        }
        return get(userId, roomId);
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
            else if (game.ownerUserId() == player.userId()) repository.updateGameOwner(roomId, nextOwner(remaining).userId());
        }
        events.publish(roomId, "PLAYER_LEFT");
    }

    private void transferOrClose(GameRow game, long leavingUserId) {
        List<GamePlayerRow> remaining = repository.players(game.id());
        if (remaining.isEmpty()) repository.closeGame(game.id());
        else if (game.ownerUserId() == leavingUserId) {
            repository.updateGameOwner(game.id(), nextOwner(remaining).userId());
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
        List<PlayerView> players = repository.roomPlayers(selectedGame.id()).stream()
                .map(p -> new PlayerView(p.gamePlayerId(), p.userId() == userId, p.nickname(), p.avatarUrl(), p.seatNo(),
                        p.seatNo() != null,
                        p.userId() == selectedGame.ownerUserId(), p.online())).toList();
        int seatedPlayers = (int) players.stream().filter(PlayerView::seated).count();
        boolean allSeatsCovered = seatedPlayers == selectedGame.playerCount()
                && players.stream().map(PlayerView::seatNo).collect(Collectors.toSet())
                .containsAll(IntStream.rangeClosed(1, selectedGame.playerCount()).boxed().toList());
        Long currentGameId = "WAITING".equals(selectedGame.status()) ? null : selectedGame.id();
        return new RoomView(selectedGame.id(), selectedGame.code(), selectedGame.playerCount(), selectedGame.status(), currentGameId,
                selectedGame.ownerUserId() == userId, me.id(), me.seatNo(), players.size(), seatedPlayers, players,
                players.size() == selectedGame.playerCount() && allSeatsCovered
                        && selectedGame.ownerUserId() == userId && "WAITING".equals(selectedGame.status()));
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
    private void requireWaiting(GameRow game) {
        if (!"WAITING".equals(game.status())) throw new BusinessException("INVALID_PHASE", "游戏开始后不能调整座位");
    }
    private int firstEmptySeat(List<GamePlayerRow> players, int maxPlayers) {
        Set<Integer> occupied = players.stream().map(GamePlayerRow::seatNo).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return IntStream.rangeClosed(1, maxPlayers).filter(seat -> !occupied.contains(seat)).findFirst()
                .orElseThrow(() -> new BusinessException("房间没有空座位"));
    }
    private GamePlayerRow nextOwner(List<GamePlayerRow> players) {
        return players.stream().min(Comparator
                .comparing(GamePlayerRow::seatNo, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparingLong(GamePlayerRow::id)).orElseThrow();
    }
    private BusinessException seatTaken() {
        return new BusinessException("SEAT_TAKEN", "该座位刚刚被其他玩家占用，请重新选择");
    }
    private String normalizedNickname(String requested, String fallback) {
        String value = StringUtils.hasText(requested) ? requested.trim() : StringUtils.hasText(fallback) ? fallback.trim() : "玩家";
        return value.length() > 32 ? value.substring(0, 32) : value;
    }

    public record CreateRequest(int maxPlayers, String nickname) {}
    public record JoinRequest(String roomCode, String nickname) {}
    public record SeatRequest(Integer seatNo) {}
    public record PlayerView(long playerId, boolean me, String nickname, String avatarUrl,
                             Integer seatNo, boolean seated, boolean host, boolean online) {}
    public record RoomView(long roomId, String roomCode, int maxPlayers, String status, Long currentGameId, boolean host,
                           long myPlayerId, Integer mySeatNo, int currentPlayers, int seatedPlayers,
                           List<PlayerView> players, boolean canStart) {}
}
