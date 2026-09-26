package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import com.avalon.game.realtime.RoomEventPublisher;
import com.avalon.game.room.RoomService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.*;

@Service
public class GameService {
    private final AvalonRepository repository;
    private final RoomService roomService;
    private final RoleVisibilityService visibilityService;
    private final RoomEventPublisher events;
    private final SecureRandom random = new SecureRandom();
    public GameService(AvalonRepository repository, RoomService roomService, RoleVisibilityService visibilityService, RoomEventPublisher events) {
        this.repository = repository; this.roomService = roomService; this.visibilityService = visibilityService; this.events = events;
    }

    @Transactional
    public GameState start(long userId, long roomId) {
        RoomRow room = roomService.requireRoom(roomId, true);
        if (room.ownerUserId() != userId) throw new BusinessException("FORBIDDEN", "只有房主可以开始游戏");
        if (!"WAITING".equals(room.status())) throw new BusinessException("游戏已经开始");
        List<PlayerRow> players = repository.players(roomId);
        if (players.size() != room.maxPlayers()) throw new BusinessException("人数未满，暂时不能开始");
        long gameId = createGame(room, players);
        events.publish(roomId, "GAME_STARTED");
        return state(userId, gameId);
    }

    private long createGame(RoomRow room, List<PlayerRow> players) {
        GameRuleConfig config = GameRuleConfig.forPlayers(players.size());
        int leaderSeat = random.nextInt(players.size()) + 1;
        long leaderId = players.stream().filter(p -> p.seatNo() == leaderSeat).findFirst().orElseThrow().id();
        Long ladyHolderId = null;
        if (config.ladyOfLake()) {
            int holderSeat = GameRulesEngine.initialLadyHolderSeat(leaderSeat, players.size());
            ladyHolderId = players.stream().filter(p -> p.seatNo() == holderSeat).findFirst().orElseThrow().id();
        }
        long gameId = repository.insertGame(room.id(), leaderId, ladyHolderId);
        List<Role> roles = GameRulesEngine.shuffledRoles(config, random);
        for (int i = 0; i < players.size(); i++) repository.insertGamePlayer(gameId, players.get(i).id(), roles.get(i));
        repository.setRoomGame(room.id(), gameId);
        return gameId;
    }

    @Transactional(readOnly = true)
    public MyRoleView myRole(long userId, long gameId) {
        Context context = context(userId, gameId, false);
        GamePlayerRow mine = requireGamePlayer(gameId, context.player.id());
        List<RoleVisibilityService.RolePlayer> all = repository.gamePlayers(gameId).stream().map(gp -> {
            PlayerRow player = repository.playerById(gp.playerId()).orElseThrow();
            return new RoleVisibilityService.RolePlayer(player.id(), player.seatNo(), player.nickname(), gp.role());
        }).toList();
        String instruction = switch (mine.role()) {
            case MERLIN -> "保护好自己的身份，帮助正义阵营找出邪恶玩家。";
            case PERCIVAL -> "你看到的是梅林与莫甘娜，但无法分辨他们。";
            case LOYAL_SERVANT -> "找出邪恶阵营，并让三个任务成功。";
            case MORGANA -> "伪装成梅林，误导派西维尔。";
            case ASSASSIN -> "阻止任务；若正义完成三个任务，找出并刺杀梅林。";
            case MINION -> "与邪恶同伴合作，让三个任务失败。";
            case MORDRED -> "梅林看不到你；与邪恶同伴合作让三个任务失败。";
            case OBERON -> "你属于邪恶阵营，但你与其他邪恶玩家互不可见。";
        };
        return new MyRoleView(mine.role().name(), mine.role().label(), mine.alignment().name(), mine.alignment() == Alignment.GOOD ? "正义阵营" : "邪恶阵营",
                mine.confirmed(), instruction, visibilityService.visiblePlayers(mine.playerId(), mine.role(), all));
    }

    @Transactional
    public GameState confirmRole(long userId, long gameId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.ROLE_CONFIRM);
        repository.confirmRole(gameId, c.player.id());
        int confirmed = repository.confirmedCount(gameId);
        if (confirmed == repository.players(c.game.roomId()).size()) repository.setPhase(gameId, Phase.TEAM_BUILDING);
        events.publish(c.game.roomId(), "ROLE_CONFIRMED");
        return state(userId, gameId);
    }

    @Transactional
    public GameState submitTeam(long userId, long gameId, List<Long> playerIds) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.TEAM_BUILDING);
        GameActionPolicy.requireLeader(c.player.id(), c.game.leaderPlayerId());
        GameRuleConfig config = GameRuleConfig.forPlayers(repository.players(c.game.roomId()).size());
        GameActionPolicy.requireTeamSize(playerIds, config.teamSize(c.game.missionNo()));
        for (Long id : playerIds) {
            PlayerRow member = repository.playerById(id).orElseThrow(() -> new BusinessException("PARAM_ERROR", "队伍中包含无效玩家"));
            if (member.roomId() != c.game.roomId()) throw new BusinessException("PARAM_ERROR", "队伍中包含其他房间玩家");
        }
        String ids = playerIds.stream().sorted().map(String::valueOf).reduce((a,b) -> a + "," + b).orElseThrow();
        repository.insertMission(gameId, c.game.missionNo(), c.game.proposalNo(), c.player.id(), ids,
                config.teamSize(c.game.missionNo()), config.failThreshold(c.game.missionNo()));
        repository.setPhase(gameId, Phase.TEAM_VOTING);
        events.publish(c.game.roomId(), "TEAM_SUBMITTED");
        return state(userId, gameId);
    }

    @Transactional
    public GameState vote(long userId, long gameId, VoteChoice choice) {
        if (choice == null) throw new BusinessException("PARAM_ERROR", "请选择赞成或反对");
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.TEAM_VOTING);
        MissionRow mission = currentMission(c.game);
        try { repository.insertVote(gameId, mission.id(), c.game.missionNo(), c.game.proposalNo(), c.player.id(), choice); }
        catch (DuplicateKeyException e) { throw new BusinessException("DUPLICATE_ACTION", "你已经投过票了"); }
        int players = repository.players(c.game.roomId()).size();
        if (repository.voteCount(mission.id()) == players) {
            boolean approved = GameRulesEngine.teamApproved(repository.approveCount(mission.id()), players);
            if (approved) {
                repository.setMissionStatus(mission.id(), "EXECUTING");
                repository.approveTeam(gameId);
                events.publish(c.game.roomId(), "TEAM_APPROVED");
                events.publish(c.game.roomId(), "MISSION_STARTED");
            } else {
                repository.setMissionStatus(mission.id(), "REJECTED");
                GameRuleConfig config = GameRuleConfig.forPlayers(players);
                int rejections = c.game.rejections() + 1;
                if (rejections >= config.rejectedTeamsToEvilWin()) {
                    repository.finish(gameId, Winner.EVIL, "FIVE_REJECTED_TEAMS");
                    events.publish(c.game.roomId(), "GAME_FINISHED");
                } else {
                    repository.updateAfterRejectedTeam(gameId, c.game.proposalNo() + 1, rejections, nextLeader(c.game));
                    events.publish(c.game.roomId(), "TEAM_REJECTED");
                }
            }
            events.publish(c.game.roomId(), "VOTE_COMPLETED");
        }
        return state(userId, gameId);
    }

    @Transactional
    public GameState mission(long userId, long gameId, MissionChoice choice) {
        if (choice == null) throw new BusinessException("PARAM_ERROR", "请选择任务结果");
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.MISSION_EXECUTING);
        MissionRow mission = currentMission(c.game);
        List<Long> team = parseIds(mission.teamPlayerIds());
        GameActionPolicy.requireMissionMember(c.player.id(), team);
        GamePlayerRow gp = requireGamePlayer(gameId, c.player.id());
        GameActionPolicy.requireMissionChoice(gp.role(), choice);
        try { repository.insertMissionAction(mission.id(), c.player.id(), choice); }
        catch (DuplicateKeyException e) { throw new BusinessException("DUPLICATE_ACTION", "你已经提交过任务了"); }
        if (repository.actionCount(mission.id()) == team.size()) {
            int fails = repository.failCount(mission.id());
            int successes = team.size() - fails;
            boolean failed = fails >= mission.failThreshold();
            repository.completeMission(mission.id(), successes, fails, failed);
            int goodScore = c.game.goodScore() + (failed ? 0 : 1);
            int evilScore = c.game.evilScore() + (failed ? 1 : 0);
            GameRuleConfig config = GameRuleConfig.forPlayers(repository.players(c.game.roomId()).size());
            GameRulesEngine.MissionTransition transition = GameRulesEngine.transitionAfterMission(
                    config, c.game.missionNo(), goodScore, evilScore);
            if (transition.phase() == Phase.FINISHED) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.FINISHED);
                repository.finish(gameId, Winner.EVIL, "THREE_FAILED_MISSIONS");
                events.publish(c.game.roomId(), "GAME_FINISHED");
            } else if (transition.phase() == Phase.LADY_OF_LAKE) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.LADY_OF_LAKE);
                events.publish(c.game.roomId(), "LADY_OF_LAKE_STARTED");
            } else if (transition.phase() == Phase.ASSASSINATION) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.ASSASSINATION);
                events.publish(c.game.roomId(), "ASSASSINATION_STARTED");
            } else {
                repository.advanceAfterMission(gameId, goodScore, evilScore, c.game.missionNo() + 1, nextLeader(c.game));
                events.publish(c.game.roomId(), "ROUND_CHANGED");
            }
            events.publish(c.game.roomId(), "MISSION_COMPLETED");
        }
        return state(userId, gameId);
    }

    @Transactional
    public LadyInspectionResult inspectWithLady(long userId, long gameId, long targetPlayerId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.LADY_OF_LAKE);
        GameActionPolicy.requireLadyHolder(c.player.id(), c.game.ladyHolderPlayerId());
        int used = repository.ladyInspectionCount(gameId);
        if (used >= 3) throw new BusinessException("INVALID_PHASE", "湖中仙女本局已经使用三次");
        List<GamePlayerRow> gamePlayers = repository.gamePlayers(gameId);
        Set<Long> playerIds = gamePlayers.stream().map(GamePlayerRow::playerId).collect(java.util.stream.Collectors.toSet());
        Set<Long> holderHistory = repository.ladyHolderHistory(gameId);
        GameActionPolicy.requireLadyTarget(c.player.id(), targetPlayerId, playerIds, holderHistory);
        GamePlayerRow targetRole = gamePlayers.stream().filter(p -> p.playerId() == targetPlayerId).findFirst()
                .orElseThrow(() -> new BusinessException("PARAM_ERROR", "目标玩家不在当前游戏"));
        PlayerRow target = repository.playerById(targetPlayerId)
                .orElseThrow(() -> new BusinessException("PARAM_ERROR", "目标玩家不存在"));
        repository.insertLadyInspection(gameId, used + 1, c.player.id(), targetPlayerId, targetRole.alignment());
        repository.updateLadyHolder(gameId, targetPlayerId);
        Phase next = GameRulesEngine.phaseAfterLady(c.game.goodScore());
        if (next == Phase.ASSASSINATION) {
            repository.setPhase(gameId, Phase.ASSASSINATION);
            events.publish(c.game.roomId(), "ASSASSINATION_STARTED");
        } else {
            repository.advanceRound(gameId, c.game.missionNo() + 1, nextLeader(c.game));
            events.publish(c.game.roomId(), "ROUND_CHANGED");
        }
        events.publish(c.game.roomId(), "LADY_OF_LAKE_COMPLETED");
        return new LadyInspectionResult(target.id(), target.seatNo(), target.nickname(), targetRole.alignment().name());
    }

    @Transactional
    public GameState assassinate(long userId, long gameId, long targetPlayerId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.ASSASSINATION);
        GamePlayerRow actor = requireGamePlayer(gameId, c.player.id());
        if (actor.role() != Role.ASSASSIN) throw new BusinessException("FORBIDDEN", "只有刺客可以选择刺杀目标");
        if (targetPlayerId == c.player.id()) throw new BusinessException("PARAM_ERROR", "不能刺杀自己");
        PlayerRow target = repository.playerById(targetPlayerId).orElseThrow(() -> new BusinessException("PARAM_ERROR", "目标玩家不存在"));
        if (target.roomId() != c.game.roomId()) throw new BusinessException("PARAM_ERROR", "目标玩家不在当前房间");
        GamePlayerRow targetRole = requireGamePlayer(gameId, targetPlayerId);
        Winner winner = GameRulesEngine.assassinationWinner(targetRole.role());
        repository.finish(gameId, winner, targetRole.role() == Role.MERLIN ? "MERLIN_ASSASSINATED" : "ASSASSINATION_MISSED");
        events.publish(c.game.roomId(), "GAME_FINISHED");
        return state(userId, gameId);
    }

    @Transactional
    public GameState restart(long userId, long gameId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.FINISHED);
        RoomRow room = roomService.requireRoom(c.game.roomId(), true);
        if (room.ownerUserId() != userId) throw new BusinessException("FORBIDDEN", "只有房主可以再来一局");
        if (!"FINISHED".equals(room.status())) throw new BusinessException("房间已经关闭，不能再来一局");
        List<PlayerRow> players = repository.players(room.id());
        GameActionPolicy.requireRestartPlayerCount(players.size(), room.maxPlayers());
        long newGameId = createGame(room, players);
        events.publish(room.id(), "GAME_STARTED");
        return state(userId, newGameId);
    }

    @Transactional(readOnly = true)
    public GameState state(long userId, long gameId) {
        Context c = context(userId, gameId, false);
        List<PlayerRow> players = repository.players(c.game.roomId());
        RoomRow room = roomService.requireRoom(c.game.roomId(), false);
        GameRuleConfig config = GameRuleConfig.forPlayers(room.maxPlayers());
        PlayerRow leader = repository.playerById(c.game.leaderPlayerId()).orElseThrow();
        MissionRow current = repository.currentMission(gameId, c.game.missionNo(), c.game.proposalNo()).orElse(null);
        MissionRow latest = repository.latestCompletedMission(gameId).orElse(null);
        List<Long> team = current == null ? List.of() : parseIds(current.teamPlayerIds());
        int voteCount = current == null ? 0 : repository.voteCount(current.id());
        List<VoteView> votes = current != null && voteCount == players.size() ? repository.votes(current.id()) : List.of();
        boolean hasVoted = current != null && repository.hasVote(current.id(), c.player.id());
        boolean hasSubmittedMission = current != null && repository.hasAction(current.id(), c.player.id());
        List<MissionRow> allMissions = repository.missions(gameId);
        MissionRow latestProposal = allMissions.isEmpty() ? null : allMissions.getLast();
        int latestProposalVotes = latestProposal == null ? 0 : repository.voteCount(latestProposal.id());
        TeamVoteResult latestVoteResult = latestProposal != null && latestProposalVotes == players.size()
                ? new TeamVoteResult(latestProposal.missionNo(), latestProposal.proposalNo(), "EXECUTING".equals(latestProposal.status()) || "SUCCESS".equals(latestProposal.status()) || "FAILED".equals(latestProposal.status()), repository.votes(latestProposal.id())) : null;
        GamePlayerRow mine = requireGamePlayer(gameId, c.player.id());
        boolean onMission = team.contains(c.player.id());
        List<PublicIdentity> identities = c.game.phase() == Phase.FINISHED ? repository.gamePlayers(gameId).stream().map(gp -> {
            PlayerRow p = repository.playerById(gp.playerId()).orElseThrow();
            return new PublicIdentity(p.id(), p.seatNo(), p.nickname(), gp.role().label(), gp.alignment().name());
        }).sorted(Comparator.comparingInt(PublicIdentity::seatNo)).toList() : List.of();
        MissionResult result = latest == null ? null : new MissionResult(latest.missionNo(), latest.successCount(), latest.failCount(), latest.status());
        PlayerRow ladyHolder = c.game.ladyHolderPlayerId() == null ? null : repository.playerById(c.game.ladyHolderPlayerId()).orElse(null);
        int ladyUsedCount = config.ladyOfLake() ? repository.ladyInspectionCount(gameId) : 0;
        boolean isLadyHolder = c.game.phase() == Phase.LADY_OF_LAKE && Objects.equals(c.game.ladyHolderPlayerId(), c.player.id());
        List<Long> ladyEligibleTargetIds = List.of();
        if (isLadyHolder) {
            Set<Long> previousHolders = repository.ladyHolderHistory(gameId);
            ladyEligibleTargetIds = repository.gamePlayers(gameId).stream().map(GamePlayerRow::playerId)
                    .filter(id -> id != c.player.id() && !previousHolders.contains(id)).toList();
        }
        return new GameState(gameId, c.game.roomId(), c.game.phase().name(), c.game.missionNo(), c.game.proposalNo(), c.game.rejections(),
                c.game.goodScore(), c.game.evilScore(), leader.id(), leader.seatNo(), leader.nickname(),
                c.game.missionNo() <= 5 ? config.teamSize(c.game.missionNo()) : 0, config.rejectedTeamsToEvilWin(),
                repository.confirmedCount(gameId), players.size(), team, voteCount, votes, hasVoted, hasSubmittedMission, onMission, latestVoteResult,
                mine.alignment() == Alignment.EVIL, mine.role() == Role.ASSASSIN, result,
                config.ladyOfLake(), c.game.ladyHolderPlayerId(), ladyHolder == null ? null : ladyHolder.seatNo(),
                ladyHolder == null ? null : ladyHolder.nickname(), isLadyHolder, ladyUsedCount, ladyEligibleTargetIds,
                c.game.winner() == null ? null : c.game.winner().name(), identities);
    }

    private Context context(long userId, long gameId, boolean lock) {
        GameRow game = repository.game(gameId, lock).orElseThrow(() -> new BusinessException("NOT_FOUND", "对局不存在"));
        PlayerRow player = roomService.requirePlayer(game.roomId(), userId);
        return new Context(game, player);
    }
    private GamePlayerRow requireGamePlayer(long gameId, long playerId) { return repository.gamePlayer(gameId, playerId).orElseThrow(() -> new BusinessException("FORBIDDEN", "你不在此对局")); }
    private MissionRow currentMission(GameRow game) { return repository.currentMission(game.id(), game.missionNo(), game.proposalNo()).orElseThrow(() -> new BusinessException("任务提案不存在")); }
    private long nextLeader(GameRow game) {
        List<PlayerRow> players = repository.players(game.roomId());
        PlayerRow leader = repository.playerById(game.leaderPlayerId()).orElseThrow();
        int nextSeat = GameRulesEngine.nextSeat(leader.seatNo(), players.size());
        return players.stream().filter(p -> p.seatNo() == nextSeat).findFirst().orElseThrow().id();
    }
    static List<Long> parseIds(String csv) { return csv == null || csv.isBlank() ? List.of() : Arrays.stream(csv.split(",")).map(Long::valueOf).toList(); }
    private record Context(GameRow game, PlayerRow player) {}

    public record MyRoleView(String roleCode, String roleName, String alignmentCode, String alignmentName, boolean confirmed,
                             String instruction, List<RoleVisibilityService.VisiblePlayer> visiblePlayers) {}
    public record MissionResult(int missionNo, Integer successCount, Integer failCount, String status) {}
    public record TeamVoteResult(int missionNo, int proposalNo, boolean approved, List<VoteView> votes) {}
    public record PublicIdentity(long playerId, int seatNo, String nickname, String roleName, String alignment) {}
    public record LadyInspectionResult(long targetPlayerId, int targetSeatNo, String targetNickname, String alignment) {}
    public record GameState(long gameId, long roomId, String phase, int missionNo, int proposalNo, int consecutiveRejections,
                            int goodScore, int evilScore, long leaderPlayerId, int leaderSeatNo, String leaderNickname,
                            int requiredTeamSize, int maxRejections, int confirmedCount, int playerCount,
                            List<Long> selectedPlayerIds, int voteCount, List<VoteView> votes, boolean hasVoted,
                            boolean hasSubmittedMission, boolean onMission, TeamVoteResult latestVoteResult,
                            boolean evil, boolean assassin, MissionResult latestMissionResult,
                            boolean ladyEnabled, Long ladyHolderPlayerId, Integer ladyHolderSeatNo, String ladyHolderNickname,
                            boolean ladyHolder, int ladyUsedCount, List<Long> ladyEligibleTargetIds, String winner,
                            List<PublicIdentity> identities) {}
    public record TeamRequest(List<Long> playerIds) {}
    public record VoteRequest(VoteChoice choice) {}
    public record MissionRequest(MissionChoice choice) {}
    public record LadyInspectionRequest(long targetPlayerId) {}
    public record AssassinateRequest(long targetPlayerId) {}
}
