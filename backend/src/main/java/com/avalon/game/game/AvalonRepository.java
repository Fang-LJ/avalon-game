package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public class AvalonRepository {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Long>> LONG_LIST = new TypeReference<>() {};
    private final JdbcTemplate jdbc;

    public AvalonRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final RowMapper<UserRow> USER = (rs, n) -> new UserRow(rs.getLong("id"), rs.getString("provider"),
            rs.getString("provider_user_id"), rs.getString("nickname"), rs.getString("avatar_url"));
    private static final RowMapper<GameRow> GAME = (rs, n) -> new GameRow(rs.getLong("id"), rs.getString("room_code"),
            rs.getLong("owner_user_id"), rs.getInt("player_count"), rs.getString("rule_version"), rs.getString("status"),
            rs.getString("phase") == null ? null : Phase.valueOf(rs.getString("phase")), rs.getInt("mission_no"),
            rs.getInt("proposal_no"), (Long) rs.getObject("leader_game_player_id"), rs.getInt("consecutive_rejections"),
            rs.getInt("good_score"), rs.getInt("evil_score"), (Long) rs.getObject("lady_holder_game_player_id"),
            rs.getString("winner_alignment") == null ? null : Winner.valueOf(rs.getString("winner_alignment")),
            rs.getString("finish_reason"), (Long) rs.getObject("assassination_target_game_player_id"),
            rs.getObject("created_at", LocalDateTime.class), rs.getObject("started_at", LocalDateTime.class),
            rs.getObject("finished_at", LocalDateTime.class));
    private static final RowMapper<GamePlayerRow> GAME_PLAYER = (rs, n) -> new GamePlayerRow(rs.getLong("id"),
            rs.getLong("game_id"), rs.getLong("user_id"), (Integer) rs.getObject("seat_no"), rs.getString("nickname_snapshot"),
            rs.getString("role_code") == null ? null : Role.valueOf(rs.getString("role_code")),
            rs.getString("alignment") == null ? null : Alignment.valueOf(rs.getString("alignment")),
            rs.getBoolean("role_confirmed"), rs.getBoolean("is_online"), rs.getObject("left_at", LocalDateTime.class));
    private static final RowMapper<ProposalRow> PROPOSAL = (rs, n) -> new ProposalRow(rs.getLong("id"), rs.getLong("game_id"),
            rs.getInt("mission_no"), rs.getInt("proposal_no"), rs.getLong("leader_game_player_id"),
            parseTeam(rs.getString("team_player_ids")), rs.getString("status"), rs.getInt("approve_count"), rs.getInt("reject_count"));
    private static final RowMapper<MissionRow> MISSION = (rs, n) -> new MissionRow(rs.getLong("id"), rs.getLong("game_id"),
            rs.getInt("mission_no"), rs.getLong("approved_proposal_id"), rs.getInt("required_players"),
            rs.getInt("fail_threshold"), (Integer) rs.getObject("success_count"), (Integer) rs.getObject("fail_count"),
            rs.getString("status"));

    public Optional<UserRow> user(String provider, String providerUserId) {
        return jdbc.query("select * from t_avalon_user where provider=? and provider_user_id=?", USER, provider, providerUserId).stream().findFirst();
    }
    public long insertUser(String provider, String providerUserId, String nickname) {
        return insert("insert into t_avalon_user(provider,provider_user_id,nickname,created_at,updated_at) values (?,?,?,now(),now())",
                provider, providerUserId, nickname);
    }
    public String nickname(long userId) { return jdbc.queryForObject("select nickname from t_avalon_user where id=?", String.class, userId); }
    public Optional<UserRow> user(long userId) {
        return jdbc.query("select * from t_avalon_user where id=?", USER, userId).stream().findFirst();
    }
    public void updateNickname(long userId, String nickname) {
        jdbc.update("update t_avalon_user set nickname=?,updated_at=now() where id=?", nickname, userId);
    }
    public void updateAvatar(long userId, String avatarUrl) {
        jdbc.update("update t_avalon_user set avatar_url=?,updated_at=now() where id=?", avatarUrl, userId);
    }
    public List<ProposalRow> proposals(long gameId) {
        return jdbc.query("select * from t_avalon_proposal where game_id=? order by mission_no,proposal_no", PROPOSAL, gameId);
    }
    /** Secrets: only GameHistoryService.replay calls these after authorization. */
    public List<MissionActionRow> missionActions(long missionId) {
        return jdbc.query("select * from t_avalon_mission_action where mission_id=? order by game_player_id",
                (rs,n) -> new MissionActionRow(rs.getLong("id"), rs.getLong("mission_id"),
                        rs.getLong("game_player_id"), MissionChoice.valueOf(rs.getString("action_choice"))), missionId);
    }
    public List<LadyActionRow> ladyActions(long gameId) {
        return jdbc.query("select * from t_avalon_lady_action where game_id=? order by sequence_no",
                (rs,n) -> new LadyActionRow(rs.getLong("id"), rs.getLong("game_id"), rs.getInt("sequence_no"),
                        rs.getLong("holder_game_player_id"), rs.getLong("target_game_player_id"),
                        Alignment.valueOf(rs.getString("result_alignment"))), gameId);
    }

    public boolean waitingRoomCodeExists(String code) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_game where room_code=? and status='WAITING'", Boolean.class, code));
    }
    public long insertWaitingGame(String code, long ownerUserId, int playerCount) {
        return insert("insert into t_avalon_game(room_code,owner_user_id,player_count,rule_version,status,phase,created_at,updated_at) values (?,?,?,'AVALON_V1','WAITING',null,now(),now())",
                code, ownerUserId, playerCount);
    }
    public long insertGamePlayer(long gameId, long userId, String nickname, Integer seatNo) {
        return insert("insert into t_avalon_game_player(game_id,user_id,seat_no,nickname_snapshot,joined_at,updated_at) values (?,?,?,?,now(),now())",
                gameId, userId, seatNo, nickname);
    }
    public Optional<GameRow> game(long id, boolean lock) {
        return jdbc.query("select * from t_avalon_game where id=?" + (lock ? " for update" : ""), GAME, id).stream().findFirst();
    }
    public Optional<GameRow> waitingGameByCode(String code, boolean lock) {
        return jdbc.query("select * from t_avalon_game where room_code=? and status='WAITING' order by id desc limit 1" + (lock ? " for update" : ""), GAME, code).stream().findFirst();
    }
    public Optional<GameRow> activeGameForUser(long userId) {
        return jdbc.query("select g.* from t_avalon_game g join t_avalon_game_player gp on gp.game_id=g.id where gp.user_id=? and gp.left_at is null and g.status in ('WAITING','PLAYING','FINISHED') order by g.id desc limit 1", GAME, userId).stream().findFirst();
    }
    public Optional<GameRow> latestGameForRoomCodeAndUser(String roomCode, long userId) {
        return jdbc.query("select g.* from t_avalon_game g join t_avalon_game_player gp on gp.game_id=g.id where g.room_code=? and gp.user_id=? and gp.left_at is null and g.status in ('WAITING','PLAYING','FINISHED') order by g.id desc limit 1",
                GAME, roomCode, userId).stream().findFirst();
    }
    public List<GamePlayerRow> players(long gameId) {
        return jdbc.query("select * from t_avalon_game_player where game_id=? and left_at is null order by seat_no is null,seat_no,id", GAME_PLAYER, gameId);
    }
    public List<RoomPlayerViewRow> roomPlayers(long gameId) {
        return jdbc.query("select gp.id game_player_id,gp.user_id,gp.seat_no,gp.nickname_snapshot,u.avatar_url,gp.is_online,u.provider"
                        + " from t_avalon_game_player gp join t_avalon_user u on u.id=gp.user_id"
                        + " where gp.game_id=? and gp.left_at is null order by gp.seat_no",
                (rs,n) -> new RoomPlayerViewRow(rs.getLong("game_player_id"), rs.getLong("user_id"),
                        (Integer) rs.getObject("seat_no"), rs.getString("nickname_snapshot"), rs.getString("avatar_url"),
                        rs.getBoolean("is_online"), "BOT".equals(rs.getString("provider"))), gameId);
    }
    public Set<Long> botUserIds(long gameId) {
        return Set.copyOf(jdbc.queryForList("select gp.user_id from t_avalon_game_player gp"
                + " join t_avalon_user u on u.id=gp.user_id where gp.game_id=? and gp.left_at is null and u.provider='BOT'", Long.class, gameId));
    }
    public List<Long> activeBotGameIds() {
        return jdbc.queryForList("select distinct g.id from t_avalon_game g"
                + " join t_avalon_game_player gp on gp.game_id=g.id join t_avalon_user u on u.id=gp.user_id"
                + " where g.status='PLAYING' and gp.left_at is null and u.provider='BOT'", Long.class);
    }
    public void deleteUnreferencedBotUser(long userId) {
        jdbc.update("delete from t_avalon_user where id=? and provider='BOT'"
                + " and not exists (select 1 from t_avalon_game_player where user_id=?)", userId, userId);
    }
    public boolean isBotGame(long gameId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_game_player gp"
                + " join t_avalon_user u on u.id=gp.user_id where gp.game_id=? and u.provider='BOT'", Boolean.class, gameId));
    }
    public List<Long> expiredBotGameIds() {
        LocalDateTime cutoff = jdbc.queryForObject("select now()", LocalDateTime.class).minusMinutes(2);
        return jdbc.queryForList("select distinct g.id from t_avalon_game g"
                + " join t_avalon_game_player gp on gp.game_id=g.id join t_avalon_user u on u.id=gp.user_id"
                + " where u.provider='BOT' and (g.status='CLOSED' or (g.status='FINISHED' and g.finished_at<=?))",
                Long.class, cutoff);
    }
    /** Caller must hold the game row lock. Never delete a human-only or running game. */
    @Transactional
    public void deleteBotTestGame(long gameId) {
        GameRow game = game(gameId, true).orElse(null);
        if (game == null || !("FINISHED".equals(game.status()) || "CLOSED".equals(game.status())) || !isBotGame(gameId)) return;
        List<Long> botIds = jdbc.queryForList("select gp.user_id from t_avalon_game_player gp"
                + " join t_avalon_user u on u.id=gp.user_id where gp.game_id=? and u.provider='BOT'", Long.class, gameId);
        jdbc.update("update t_avalon_game set leader_game_player_id=null,lady_holder_game_player_id=null,assassination_target_game_player_id=null where id=?", gameId);
        jdbc.update("delete from t_avalon_lady_action where game_id=?", gameId);
        jdbc.update("delete from t_avalon_mission_action where mission_id in (select id from t_avalon_mission where game_id=?)", gameId);
        jdbc.update("delete from t_avalon_vote where proposal_id in (select id from t_avalon_proposal where game_id=?)", gameId);
        jdbc.update("delete from t_avalon_mission where game_id=?", gameId);
        jdbc.update("delete from t_avalon_proposal where game_id=?", gameId);
        jdbc.update("delete from t_avalon_game_player where game_id=?", gameId);
        jdbc.update("delete from t_avalon_game where id=?", gameId);
        botIds.forEach(this::deleteUnreferencedBotUser);
    }
    public List<GamePlayerRow> gamePlayers(long gameId) {
        return jdbc.query("select * from t_avalon_game_player where game_id=? order by seat_no", GAME_PLAYER, gameId);
    }
    /** Ended-game identities include every participant, including those who have already left. */
    public List<GamePlayerIdentityRow> gamePlayerIdentities(long gameId) {
        return jdbc.query("select gp.id,gp.seat_no,gp.nickname_snapshot,u.avatar_url,gp.role_code,gp.alignment,u.provider"
                        + " from t_avalon_game_player gp join t_avalon_user u on u.id=gp.user_id"
                        + " where gp.game_id=? order by gp.seat_no,gp.id",
                (rs,n) -> new GamePlayerIdentityRow(rs.getLong("id"), (Integer) rs.getObject("seat_no"),
                        rs.getString("nickname_snapshot"), rs.getString("avatar_url"),
                        rs.getString("role_code") == null ? null : Role.valueOf(rs.getString("role_code")),
                        rs.getString("alignment") == null ? null : Alignment.valueOf(rs.getString("alignment")),
                        "BOT".equals(rs.getString("provider"))), gameId);
    }
    public Optional<GamePlayerRow> gamePlayer(long gameId, long gamePlayerId) {
        return jdbc.query("select * from t_avalon_game_player where game_id=? and id=? and left_at is null", GAME_PLAYER, gameId, gamePlayerId).stream().findFirst();
    }
    public Optional<GamePlayerRow> player(long gameId, long userId) {
        return jdbc.query("select * from t_avalon_game_player where game_id=? and user_id=? and left_at is null", GAME_PLAYER, gameId, userId).stream().findFirst();
    }
    public Optional<GamePlayerRow> gamePlayerById(long gamePlayerId) {
        return jdbc.query("select * from t_avalon_game_player where id=?", GAME_PLAYER, gamePlayerId).stream().findFirst();
    }
    public void deleteGamePlayer(long gamePlayerId) { jdbc.update("delete from t_avalon_game_player where id=?", gamePlayerId); }
    public void leaveGamePlayer(long gamePlayerId) { jdbc.update("update t_avalon_game_player set is_online=false,left_at=now(),updated_at=now() where id=?", gamePlayerId); }
    public void archiveGamePlayers(long gameId) {
        jdbc.update("update t_avalon_game_player set is_online=false,left_at=coalesce(left_at,now()),updated_at=now() where game_id=? and left_at is null", gameId);
    }
    public void setPlayerOnline(long gamePlayerId, boolean online) { jdbc.update("update t_avalon_game_player set is_online=?,updated_at=now() where id=?", online, gamePlayerId); }
    public void updateSeat(long gamePlayerId, Integer seat) {
        jdbc.update("update t_avalon_game_player set seat_no=?,updated_at=now() where id=?", seat, gamePlayerId);
    }
    public void updateGameOwner(long gameId, long userId) { jdbc.update("update t_avalon_game set owner_user_id=?,updated_at=now() where id=?", userId, gameId); }
    public void closeGame(long gameId) { jdbc.update("update t_avalon_game set status='CLOSED',updated_at=now() where id=?", gameId); }

    public void assignRole(long gameId, long gamePlayerId, Role role) {
        jdbc.update("update t_avalon_game_player set role_code=?,alignment=?,role_confirmed=false,updated_at=now() where game_id=? and id=?",
                role.name(), role.alignment().name(), gameId, gamePlayerId);
    }
    public void startGame(long gameId, long leaderGamePlayerId, Long ladyHolderGamePlayerId) {
        jdbc.update("update t_avalon_game set status='PLAYING',phase='ROLE_CONFIRM',mission_no=1,proposal_no=1,leader_game_player_id=?,lady_holder_game_player_id=?,consecutive_rejections=0,good_score=0,evil_score=0,winner_alignment=null,finish_reason=null,assassination_target_game_player_id=null,started_at=now(),finished_at=null,updated_at=now() where id=?",
                leaderGamePlayerId, ladyHolderGamePlayerId, gameId);
    }
    public void confirmRole(long gameId, long gamePlayerId) { jdbc.update("update t_avalon_game_player set role_confirmed=true,updated_at=now() where game_id=? and id=? and role_confirmed=false", gameId, gamePlayerId); }
    public int confirmedCount(long gameId) { return jdbc.queryForObject("select count(*) from t_avalon_game_player where game_id=? and role_confirmed=true", Integer.class, gameId); }
    public void setPhase(long gameId, Phase phase) { jdbc.update("update t_avalon_game set phase=?,updated_at=now() where id=?", phase.name(), gameId); }
    public void updateAfterRejectedTeam(long gameId, int proposalNo, int rejections, long leaderGamePlayerId) {
        jdbc.update("update t_avalon_game set phase='TEAM_BUILDING',proposal_no=?,consecutive_rejections=?,leader_game_player_id=?,updated_at=now() where id=?",
                proposalNo, rejections, leaderGamePlayerId, gameId);
    }
    public void finish(long gameId, Winner winner, String reason, Long assassinationTargetGamePlayerId) {
        jdbc.update("update t_avalon_game set status='FINISHED',phase='FINISHED',winner_alignment=?,finish_reason=?,assassination_target_game_player_id=?,finished_at=now(),updated_at=now() where id=?",
                winner == null ? null : winner.name(), reason, assassinationTargetGamePlayerId, gameId);
    }
    public void advanceRound(long gameId, int missionNo, long leaderGamePlayerId) {
        jdbc.update("update t_avalon_game set mission_no=?,leader_game_player_id=?,proposal_no=1,consecutive_rejections=0,phase='TEAM_BUILDING',updated_at=now() where id=?",
                missionNo, leaderGamePlayerId, gameId);
    }
    public void advanceAfterMission(long gameId, int goodScore, int evilScore, int missionNo, long leaderGamePlayerId) {
        jdbc.update("update t_avalon_game set good_score=?,evil_score=?,mission_no=?,leader_game_player_id=?,proposal_no=1,consecutive_rejections=0,phase='TEAM_BUILDING',updated_at=now() where id=?",
                goodScore, evilScore, missionNo, leaderGamePlayerId, gameId);
    }
    public void applyMissionScore(long gameId, int goodScore, int evilScore, Phase phase) {
        jdbc.update("update t_avalon_game set good_score=?,evil_score=?,phase=?,updated_at=now() where id=?", goodScore, evilScore, phase.name(), gameId);
    }

    public long insertProposal(long gameId, int missionNo, int proposalNo, long leaderGamePlayerId, List<Long> teamPlayerIds) {
        return insert("insert into t_avalon_proposal(game_id,mission_no,proposal_no,leader_game_player_id,team_player_ids,status,created_at) values (?,?,?,?,?,'VOTING',now())",
                gameId, missionNo, proposalNo, leaderGamePlayerId, teamJson(teamPlayerIds));
    }
    public Optional<ProposalRow> proposal(long proposalId) {
        return jdbc.query("select * from t_avalon_proposal where id=?", PROPOSAL, proposalId).stream().findFirst();
    }
    public Optional<ProposalRow> currentProposal(long gameId, int missionNo, int proposalNo) {
        return jdbc.query("select * from t_avalon_proposal where game_id=? and mission_no=? and proposal_no=?", PROPOSAL, gameId, missionNo, proposalNo).stream().findFirst();
    }
    public Optional<ProposalRow> latestResolvedProposal(long gameId) {
        return jdbc.query("select * from t_avalon_proposal where game_id=? and status in ('APPROVED','REJECTED') order by mission_no desc,proposal_no desc limit 1", PROPOSAL, gameId).stream().findFirst();
    }
    public void resolveProposal(long proposalId, boolean approved, int approveCount, int rejectCount) {
        jdbc.update("update t_avalon_proposal set status=?,approve_count=?,reject_count=?,resolved_at=now() where id=?",
                approved ? "APPROVED" : "REJECTED", approveCount, rejectCount, proposalId);
    }
    public void insertVote(long proposalId, long gamePlayerId, VoteChoice choice) {
        jdbc.update("insert into t_avalon_vote(proposal_id,game_player_id,vote_choice,created_at) values (?,?,?,now())",
                proposalId, gamePlayerId, choice.name());
    }
    public int voteCount(long proposalId) { return jdbc.queryForObject("select count(*) from t_avalon_vote where proposal_id=?", Integer.class, proposalId); }
    public int approveCount(long proposalId) { return jdbc.queryForObject("select count(*) from t_avalon_vote where proposal_id=? and vote_choice='APPROVE'", Integer.class, proposalId); }
    public boolean hasVote(long proposalId, long gamePlayerId) { return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_vote where proposal_id=? and game_player_id=?", Boolean.class, proposalId, gamePlayerId)); }
    public List<VoteView> votes(long proposalId) {
        return jdbc.query("select v.game_player_id,gp.seat_no,gp.nickname_snapshot,v.vote_choice from t_avalon_vote v join t_avalon_game_player gp on gp.id=v.game_player_id where v.proposal_id=? order by gp.seat_no",
                (rs,n) -> new VoteView(rs.getLong(1), rs.getInt(2), rs.getString(3), VoteChoice.valueOf(rs.getString(4))), proposalId);
    }

    public long insertMission(long gameId, int missionNo, long approvedProposalId, int requiredPlayers, int failThreshold) {
        return insert("insert into t_avalon_mission(game_id,mission_no,approved_proposal_id,required_players,fail_threshold,status,created_at) values (?,?,?,?,?,'EXECUTING',now())",
                gameId, missionNo, approvedProposalId, requiredPlayers, failThreshold);
    }
    public Optional<MissionRow> currentMission(long gameId, int missionNo) {
        return jdbc.query("select * from t_avalon_mission where game_id=? and mission_no=?", MISSION, gameId, missionNo).stream().findFirst();
    }
    public Optional<MissionRow> latestCompletedMission(long gameId) {
        return jdbc.query("select * from t_avalon_mission where game_id=? and status in ('SUCCESS','FAILED') order by mission_no desc limit 1", MISSION, gameId).stream().findFirst();
    }
    public List<MissionRow> missions(long gameId) { return jdbc.query("select * from t_avalon_mission where game_id=? order by mission_no", MISSION, gameId); }
    public void completeMission(long missionId, int successes, int fails, boolean failed) {
        jdbc.update("update t_avalon_mission set status=?,success_count=?,fail_count=?,completed_at=now() where id=?",
                failed ? "FAILED" : "SUCCESS", successes, fails, missionId);
    }
    public void insertMissionAction(long missionId, long gamePlayerId, MissionChoice choice) {
        jdbc.update("insert into t_avalon_mission_action(mission_id,game_player_id,action_choice,created_at) values (?,?,?,now())",
                missionId, gamePlayerId, choice.name());
    }
    public int actionCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_mission_action where mission_id=?", Integer.class, missionId); }
    public int failCount(long missionId) { return jdbc.queryForObject("select count(*) from t_avalon_mission_action where mission_id=? and action_choice='FAIL'", Integer.class, missionId); }
    public boolean hasAction(long missionId, long gamePlayerId) { return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)>0 from t_avalon_mission_action where mission_id=? and game_player_id=?", Boolean.class, missionId, gamePlayerId)); }

    public int ladyActionCount(long gameId) { return jdbc.queryForObject("select count(*) from t_avalon_lady_action where game_id=?", Integer.class, gameId); }
    public Set<Long> ladyHolderHistory(long gameId) {
        return Set.copyOf(jdbc.queryForList("select holder_game_player_id from t_avalon_lady_action where game_id=?", Long.class, gameId));
    }
    public void insertLadyAction(long gameId, int sequenceNo, long holderGamePlayerId, long targetGamePlayerId, Alignment alignment) {
        jdbc.update("insert into t_avalon_lady_action(game_id,sequence_no,holder_game_player_id,target_game_player_id,result_alignment,created_at) values (?,?,?,?,?,now())",
                gameId, sequenceNo, holderGamePlayerId, targetGamePlayerId, alignment.name());
    }
    public void updateLadyHolder(long gameId, long gamePlayerId) {
        jdbc.update("update t_avalon_game set lady_holder_game_player_id=?,updated_at=now() where id=?", gamePlayerId, gameId);
    }

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
    private static String teamJson(List<Long> ids) {
        try { return JSON.writeValueAsString(ids); }
        catch (Exception e) { throw new IllegalArgumentException("无法序列化任务队伍", e); }
    }
    private static List<Long> parseTeam(String json) {
        try { return List.copyOf(JSON.readValue(json, LONG_LIST)); }
        catch (Exception e) { throw new IllegalArgumentException("无法读取任务队伍", e); }
    }

    public record UserRow(long id, String provider, String providerUserId, String nickname, String avatarUrl) {}
    public record GameRow(long id, String code, long ownerUserId, int playerCount, String ruleVersion, String status,
                          Phase phase, int missionNo, int proposalNo, Long leaderGamePlayerId, int rejections,
                          int goodScore, int evilScore, Long ladyHolderGamePlayerId, Winner winner, String finishReason,
                          Long assassinationTargetGamePlayerId, LocalDateTime createdAt, LocalDateTime startedAt,
                          LocalDateTime finishedAt) {}
    public record GamePlayerRow(long id, long gameId, long userId, Integer seatNo, String nickname, Role role,
                                Alignment alignment, boolean confirmed, boolean online, LocalDateTime leftAt) {}
    public record GamePlayerIdentityRow(long id, Integer seatNo, String nickname, String avatarUrl,
                                        Role role, Alignment alignment, boolean isBot) {}
    public record RoomPlayerViewRow(long gamePlayerId, long userId, Integer seatNo, String nickname,
                                    String avatarUrl, boolean online, boolean isBot) {
        public RoomPlayerViewRow(long gamePlayerId, long userId, Integer seatNo, String nickname, String avatarUrl, boolean online) {
            this(gamePlayerId, userId, seatNo, nickname, avatarUrl, online, false);
        }
    }
    public record ProposalRow(long id, long gameId, int missionNo, int proposalNo, long leaderGamePlayerId,
                              List<Long> teamPlayerIds, String status, int approveCount, int rejectCount) {}
    public record VoteRow(long id, long proposalId, long gamePlayerId, VoteChoice choice) {}
    public record MissionRow(long id, long gameId, int missionNo, long approvedProposalId, int requiredPlayers,
                             int failThreshold, Integer successCount, Integer failCount, String status) {}
    public record MissionActionRow(long id, long missionId, long gamePlayerId, MissionChoice choice) {}
    public record LadyActionRow(long id, long gameId, int sequenceNo, long holderGamePlayerId,
                                long targetGamePlayerId, Alignment resultAlignment) {}
    public record VoteView(long playerId, int seatNo, String nickname, VoteChoice choice) {}
}
