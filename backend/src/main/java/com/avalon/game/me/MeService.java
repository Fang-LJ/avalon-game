package com.avalon.game.me;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.GameTypes.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class MeService {
    // No left_at filter: archived participants still own their history and statistics.
    static final String FINISHED_FROM = " from t_avalon_game g join t_avalon_game_player p on p.game_id=g.id"
            + " where p.user_id=? and g.phase='FINISHED' and g.status in ('FINISHED','CLOSED')";
    private final AvalonRepository repository;
    private final JdbcTemplate jdbc;
    public MeService(AvalonRepository repository, JdbcTemplate jdbc) { this.repository = repository; this.jdbc = jdbc; }

    public Profile profile(long userId) {
        var user = repository.user(userId).orElseThrow(() -> new BusinessException("UNAUTHORIZED", "请重新登录"));
        return new Profile(user.id(), user.nickname(), user.avatarUrl());
    }
    @Transactional
    public Profile updateNickname(long userId, String nickname) {
        profile(userId);
        if (nickname == null || nickname.isBlank() || nickname.trim().length() > 32 || nickname.codePoints().anyMatch(Character::isISOControl))
            throw new BusinessException("PARAM_ERROR", "昵称须为 1–32 个字符");
        repository.updateNickname(userId, nickname.trim());
        return profile(userId);
    }

    public GamesPage games(long userId, int page, int size, String alignment) {
        if (page < 1 || page > 100000 || size < 1 || size > 50)
            throw new BusinessException("PARAM_ERROR", "分页参数不正确");
        String filter = "";
        List<Object> args = new ArrayList<>(); args.add(userId);
        if (alignment != null && !alignment.isBlank()) {
            if (!"GOOD".equals(alignment) && !"EVIL".equals(alignment))
                throw new BusinessException("PARAM_ERROR", "阵营参数不正确");
            filter = " and p.alignment=?"; args.add(alignment);
        }
        Long total = jdbc.queryForObject("select count(*)" + FINISHED_FROM + filter, Long.class, args.toArray());
        args.add(size); args.add((page - 1) * size);
        List<HistoryGame> items = jdbc.query("select g.id,g.room_code,g.player_count,p.role_code,p.alignment,g.winner_alignment,"
                        + "g.finish_reason,g.started_at,g.finished_at" + FINISHED_FROM + filter
                        + " order by g.finished_at desc,g.id desc limit ? offset ?", (rs,n) -> {
                    Role role = Role.valueOf(rs.getString("role_code"));
                    Alignment side = Alignment.valueOf(rs.getString("alignment"));
                    Winner winner = Winner.valueOf(rs.getString("winner_alignment"));
                    return new HistoryGame(rs.getLong("id"), rs.getString("room_code"), rs.getInt("player_count"),
                            role, role.label(), side, winner, side.name().equals(winner.name()), rs.getString("finish_reason"),
                            rs.getObject("started_at", LocalDateTime.class), rs.getObject("finished_at", LocalDateTime.class));
                }, args.toArray());
        return new GamesPage(items, total == null ? 0 : total, page, size);
    }

    public Stats stats(long userId) {
        List<RoleCount> counts = jdbc.query("select p.role_code,count(*) games,sum(p.alignment=g.winner_alignment) wins"
                        + FINISHED_FROM + " group by p.role_code order by games desc,p.role_code", (rs,n) -> {
                    Role role = Role.valueOf(rs.getString("role_code"));
                    return new RoleCount(role, role.label(), role.alignment(), rs.getLong("games"), rs.getLong("wins"));
                }, userId);
        long total = counts.stream().mapToLong(RoleCount::games).sum();
        long wins = counts.stream().mapToLong(RoleCount::wins).sum();
        long good = counts.stream().filter(r -> r.alignment() == Alignment.GOOD).mapToLong(RoleCount::games).sum();
        long goodWins = counts.stream().filter(r -> r.alignment() == Alignment.GOOD).mapToLong(RoleCount::wins).sum();
        return new Stats(total, wins, total - wins, total == 0 ? 0 : Math.round(wins * 1000.0 / total) / 10.0,
                good, goodWins, total - good, wins - goodWins, counts);
    }
    public record Profile(long userId, String nickname, String avatarUrl) {}
    public record HistoryGame(long gameId, String roomCode, int playerCount, Role roleCode, String roleName,
                              Alignment alignment, Winner winner, boolean won, String finishReason,
                              LocalDateTime startedAt, LocalDateTime finishedAt) {}
    public record GamesPage(List<HistoryGame> items, long total, int page, int size) {}
    public record RoleCount(Role roleCode, String roleName, Alignment alignment, long games, long wins) {}
    public record Stats(long totalGames, long wins, long losses, double winRate, long goodGames, long goodWins,
                        long evilGames, long evilWins, List<RoleCount> roleCounts) {}
}
