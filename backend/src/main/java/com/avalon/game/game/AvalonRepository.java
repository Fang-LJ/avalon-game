package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class AvalonRepository {
    private final JdbcTemplate jdbc;
    public AvalonRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final RowMapper<RoomRow> ROOM = (rs, n) -> new RoomRow(rs.getLong("id"), rs.getString("room_code"),
            rs.getLong("owner_user_id"), rs.getInt("max_players"), rs.getString("status"),
            (Long) rs.getObject("current_game_id"), rs.getObject("created_at", LocalDateTime.class), rs.getObject("started_at", LocalDateTime.class));
    private static final RowMapper<PlayerRow> PLAYER = (rs, n) -> new PlayerRow(rs.getLong("id"), rs.getLong("room_id"),
            rs.getLong("user_id"), rs.getString("nickname"), rs.getInt("seat_no"), rs.getBoolean("is_host"), rs.getBoolean("is_online"));
    private static final RowMapper<GameRow> GAME = (rs, n) -> new GameRow(rs.getLong("id"), rs.getLong("room_id"),
            rs.getInt("mission_no"), rs.getLong("leader_player_id"), rs.getInt("proposal_no"), rs.getInt("consecutive_rejections"),
            rs.getInt("good_score"), rs.getInt("evil_score"), Phase.valueOf(rs.getString("phase")),
            rs.getString("winner") == null ? null : Winner.valueOf(rs.getString("winner")));
    private static final RowMapper<GamePlayerRow> GAME_PLAYER = (rs, n) -> new GamePlayerRow(rs.getLong("id"), rs.getLong("game_id"),
            rs.getLong("player_id"), Role.valueOf(rs.getString("role_code")), Alignment.valueOf(rs.getString("alignment")), rs.getBoolean("role_confirmed"));
    private static final RowMapper<MissionRow> MISSION = (rs, n) -> new MissionRow(rs.getLong("id"), rs.getLong("game_id"),
            rs.getInt("mission_no"), rs.getInt("proposal_no"), rs.getLong("leader_player_id"), rs.getString("team_player_ids"),
            rs.getInt("required_players"), rs.getInt("fail_threshold"), rs.getString("status"),
            (Integer) rs.getObject("success_count"), (Integer) rs.getObject("fail_count"));

    public long insertRoom(String code, long ownerUserId, int maxPlayers) {
        return insert("insert into t_avalon_room(room_code,owner_user_id,max_players,status,created_at,updated_at) values (?,?,?,'WAITING',now(),now())",
                code, ownerUserId, maxPlayers);
    }
    public long insertPlayer(long roomId, long userId, String nickname, int seatNo, boolean host) {
        return insert("insert into t_avalon_player(room_id,user_id,nickname,seat_no,is_host,is_ready,is_online,created_at,updated_at) values (?,?,?,?,?,false,true,now(),now())",
                roomId, userId, nickname, seatNo, host);
    }
    public Optional<RoomRow> room(long id, boolean lock) {
        return jdbc.query("select * from t_avalon_room where id=?" + (lock ? " for update" : ""), ROOM, id).stream().findFirst();
    }
    public Optional<RoomRow> roomByCode(String code, boolean lock) {
        return jdbc.query("select * from t_avalon_room where room_code=?" + (lock ? " for update" : ""), ROOM, code).stream().findFirst();
    }
    public Optional<RoomRow> activeRoomForUser(long userId) {
        return jdbc.query("select r.* from t_avalon_room r join t_avalon_player p on p.room_id=r.id where p.user_id=? and p.left_at is null and r.status in ('WAITING','PLAYING','FINISHED') order by r.id desc limit 1", ROOM, userId).stream().findFirst();
    }
    public List<PlayerRow> players(long roomId) {
        return jdbc.query("select * from t_avalon_player where room_id=? and left_at is null order by seat_no", PLAYER, roomId);
    }
    public Optional<PlayerRow> player(long roomId, long userId) {
        return jdbc.query("select * from t_avalon_player where room_id=? and user_id=? and left_at is null", PLAYER, roomId, userId).stream().findFirst();
    }
    public Optional<PlayerRow> playerById(long playerId) {
        return jdbc.query("select * from t_avalon_player where id=?", PLAYER, playerId).stream().findFirst();
    }
    public String nickname(long userId) { return jdbc.queryForObject("select nickname from t_avalon_user where id=?", String.class, userId); }
    public void deletePlayer(long playerId) { jdbc.update("delete from t_avalon_player where id=?", playerId); }
    public void leavePlayer(long playerId) { jdbc.update("update t_avalon_player set is_online=false,left_at=now(),updated_at=now() where id=?", playerId); }
    public void setPlayerOnline(long playerId, boolean online) { jdbc.update("update t_avalon_player set is_online=?,updated_at=now() where id=?", online, playerId); }
    public void reseat(long playerId, int seat, boolean host) { jdbc.update("update t_avalon_player set seat_no=?,is_host=?,updated_at=now() where id=?", seat, host, playerId); }
    public void updateRoomOwner(long roomId, long userId) { jdbc.update("update t_avalon_room set owner_user_id=?,updated_at=now() where id=?", userId, roomId); }
    public void closeRoom(long roomId) { jdbc.update("update t_avalon_room set status='CLOSED',updated_at=now() where id=?", roomId); }
    public void setRoomGame(long roomId, long gameId) { jdbc.update("update t_avalon_room set status='PLAYING',current_game_id=?,started_at=now(),updated_at=now() where id=?", gameId, roomId); }

    public long insertGame(long roomId, long leaderPlayerId) {
        return insert("insert into t_avalon_game(room_id,mission_no,leader_player_id,proposal_no,consecutive_rejections,good_score,evil_score,phase,created_at,updated_at) values (?,1,?,1,0,0,0,'ROLE_CONFIRM',now(),now())", roomId, leaderPlayerId);
    }
    public void insertGamePlayer(long gameId, long playerId, Role role) {
        jdbc.update("insert into t_avalon_game_player(game_id,player_id,role_code,alignment,role_confirmed,created_at) values (?,?,?,?,false,now())",
                gameId, playerId, role.name(), role.alignment().name());
    }
    public Optional<GameRow> game(long id, boolean lock) {
        return jdbc.query("select * from t_avalon_game where id=?" + (lock ? " for update" : ""), GAME, id).stream().findFirst();
    }
    public List<GamePlayerRow> gamePlayers(long gameId) { return jdbc.query("select * from t_avalon_game_player where game_id=?", GAME_PLAYER, gameId); }
    public Optional<GamePlayerRow> gamePlayer(long gameId, long playerId) {
        return jdbc.query("select * from t_avalon_game_player where game_id=? and player_id=?", GAME_PLAYER, gameId, playerId).stream().findFirst();
    }
    public void confirmRole(long gameId, long playerId) { jdbc.update("update t_avalon_game_player set role_confirmed=true,confirmed_at=now() where game_id=? and player_id=? and role_confirmed=false", gameId, playerId); }
    public int confirmedCount(long gameId) { return jdbc.queryForObject("select count(*) from t_avalon_game_player where game_id=? and role_confirmed=true", Integer.class, gameId); }
    public void setPhase(long gameId, Phase phase) { jdbc.update("update t_avalon_game set phase=?,updated_at=now() where id=?", phase.name(), gameId); }
    public void approveTeam(long gameId) { jdbc.update("update t_avalon_game set phase='MISSION_EXECUTING',consecutive_rejections=0,updated_at=now() where id=?", gameId); }
    public void updateAfterRejectedTeam(long gameId, int proposalNo, int rejections, long leaderPlayerId) {
        jdbc.update("update t_avalon_game set phase='TEAM_BUILDING',proposal_no=?,consecutive_rejections=?,leader_player_id=?,updated_at=now() where id=?", proposalNo, rejections, leaderPlayerId, gameId);
    }
    public void finish(long gameId, Winner winner, String reason) {
        jdbc.update("update t_avalon_game set phase='FINISHED',winner=?,finish_reason=?,finished_at=now(),updated_at=now() where id=?", winner.name(), reason, gameId);
        jdbc.update("update t_avalon_room set status='FINISHED',updated_at=now() where current_game_id=?", gameId);
    }
    public void advanceRound(long gameId, int missionNo, long leaderPlayerId) {
        jdbc.update("update t_avalon_game set mission_no=?,leader_player_id=?,proposal_no=1,consecutive_rejections=0,phase='TEAM_BUILDING',updated_at=now() where id=?", missionNo, leaderPlayerId, gameId);
    }
    public void applyMissionScore(long gameId, int goodScore, int evilScore, Phase phase) {
        jdbc.update("update t_avalon_game set good_score=?,evil_score=?,phase=?,updated_at=now() where id=?", goodScore, evilScore, phase.name(), gameId);
    }
    public long insertMission(long gameId, int missionNo, int proposalNo, long leaderId, String teamIds, int required, int threshold) {
        return insert("insert into t_avalon_mission(game_id,mission_no,proposal_no,leader_player_id,team_player_ids,required_players,fail_threshold,status,created_at) values (?,?,?,?,?,?,?,'VOTING',now())",
                gameId, missionNo, proposalNo, leaderId, teamIds, required, threshold);
    }
    public Optional<MissionRow> currentMission(long gameId, int missionNo, int proposalNo) {
        return jdbc.query("select * from t_avalon_mission where game_id=? and mission_no=? and proposal_no=?", MISSION, gameId, missionNo, proposalNo).stream().findFirst();
    }
    public Optional<MissionRow> latestCompletedMission(long gameId) {
        return jdbc.query("select * from t_avalon_mission where game_id=? and status in ('SUCCESS','FAILED') order by mission_no desc,id desc limit 1", MISSION, gameId).stream().findFirst();
    }
    public List<MissionRow> missions(long gameId) { return jdbc.query("select * from t_avalon_mission where game_id=? order by mission_no,proposal_no", MISSION, gameId); }
    public void setMissionStatus(long id, String status) { jdbc.update("update t_avalon_mission set status=? where id=?", status, id); }
    public void completeMission(long id, int successes, int fails, boolean failed) {
        jdbc.update("update t_avalon_mission set status=?,success_count=?,fail_count=?,completed_at=now() where id=?", failed ? "FAILED" : "SUCCESS", successes, fails, id);
    }
    public void insertVote(long gameId, long missionId, int missionNo, int proposalNo, long playerId, VoteChoice choice) {
        jdbc.update("insert into t_avalon_vote(game_id,mission_id,mission_no,proposal_no,player_id,vote_choice,created_at) values (?,?,?,?,?,?,now())",
                gameId, missionId, missionNo, proposalNo, playerId, choice.name());
    }
    public int voteCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_vote where mission_id=?", Integer.class, missionId); }
    public int approveCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_vote where mission_id=? and vote_choice='APPROVE'", Integer.class, missionId); }
    public boolean hasVote(long missionId, long playerId) { return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_vote where mission_id=? and player_id=?", Boolean.class, missionId, playerId)); }
    public List<VoteView> votes(long missionId) {
        return jdbc.query("select v.player_id,p.seat_no,p.nickname,v.vote_choice from t_avalon_vote v join t_avalon_player p on p.id=v.player_id where v.mission_id=? order by p.seat_no",
                (rs,n) -> new VoteView(rs.getLong(1), rs.getInt(2), rs.getString(3), VoteChoice.valueOf(rs.getString(4))), missionId);
    }
    public void insertMissionAction(long missionId, long playerId, MissionChoice choice) {
        jdbc.update("insert into t_avalon_mission_action(mission_id,player_id,action_choice,created_at) values (?,?,?,now())", missionId, playerId, choice.name());
    }
    public int actionCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_mission_action where mission_id=?", Integer.class, missionId); }
    public int failCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_mission_action where mission_id=? and action_choice='FAIL'", Integer.class, missionId); }
    public boolean hasAction(long missionId, long playerId) { return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_mission_action where mission_id=? and player_id=?", Boolean.class, missionId, playerId)); }

    private long insert(String sql, Object... args) {
        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
            return ps;
        }, key);
        if (key.getKey() == null) throw new BusinessException("数据库未返回主键");
        return key.getKey().longValue();
    }

    public record RoomRow(long id, String code, long ownerUserId, int maxPlayers, String status, Long currentGameId, LocalDateTime createdAt, LocalDateTime startedAt) {}
    public record PlayerRow(long id, long roomId, long userId, String nickname, int seatNo, boolean host, boolean online) {}
    public record GameRow(long id, long roomId, int missionNo, long leaderPlayerId, int proposalNo, int rejections, int goodScore, int evilScore, Phase phase, Winner winner) {}
    public record GamePlayerRow(long id, long gameId, long playerId, Role role, Alignment alignment, boolean confirmed) {}
    public record MissionRow(long id, long gameId, int missionNo, int proposalNo, long leaderPlayerId, String teamPlayerIds, int requiredPlayers, int failThreshold, String status, Integer successCount, Integer failCount) {}
    public record VoteView(long playerId, int seatNo, String nickname, VoteChoice choice) {}
}
