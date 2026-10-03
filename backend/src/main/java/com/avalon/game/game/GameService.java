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
import java.util.stream.Collectors;

@Service
public class GameService {
    private final AvalonRepository repository;
    private final RoomService roomService;
    private final RoleVisibilityService visibilityService;
    private final RoomEventPublisher events;
    private final SecureRandom random = new SecureRandom();

    public GameService(AvalonRepository repository, RoomService roomService,
                       RoleVisibilityService visibilityService, RoomEventPublisher events) {
        this.repository = repository;
        this.roomService = roomService;
        this.visibilityService = visibilityService;
        this.events = events;
    }

    @Transactional
    public GameState start(long userId, long gameId) {
        GameRow game = roomService.requireRoom(gameId, true);
        if (game.ownerUserId() != userId) throw new BusinessException("FORBIDDEN", "只有房主可以开始游戏");
        if (!"WAITING".equals(game.status())) throw new BusinessException("游戏已经开始");
        List<GamePlayerRow> players = repository.players(gameId);
        if (players.size() != game.playerCount()) throw new BusinessException("人数未满，暂时不能开始");
        requireCompleteSeating(players, game.playerCount());
        initializeGame(game, players);
        events.publish(gameId, "GAME_STARTED");
        return state(userId, gameId);
    }

    private void initializeGame(GameRow game, List<GamePlayerRow> players) {
        GameRuleConfig config = GameRuleConfig.forPlayers(players.size());
        int leaderSeat = random.nextInt(players.size()) + 1;
        long leaderId = players.stream().filter(p -> Objects.equals(p.seatNo(), leaderSeat)).findFirst().orElseThrow().id();
        Long ladyHolderId = null;
        if (config.ladyOfLake()) {
            int holderSeat = GameRulesEngine.initialLadyHolderSeat(leaderSeat, players.size());
            ladyHolderId = players.stream().filter(p -> Objects.equals(p.seatNo(), holderSeat)).findFirst().orElseThrow().id();
        }
        List<Role> roles = GameRulesEngine.shuffledRoles(config, random);
        for (int i = 0; i < players.size(); i++) repository.assignRole(game.id(), players.get(i).id(), roles.get(i));
        repository.startGame(game.id(), leaderId, ladyHolderId);
    }

    @Transactional(readOnly = true)
    public MyRoleView myRole(long userId, long gameId) {
        Context context = context(userId, gameId, false);
        GamePlayerRow mine = context.player;
        List<RoleVisibilityService.RolePlayer> all = repository.gamePlayers(gameId).stream()
                .map(gp -> new RoleVisibilityService.RolePlayer(gp.id(), requireSeat(gp), gp.nickname(), gp.role())).toList();
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
        return new MyRoleView(mine.role().name(), mine.role().label(), mine.alignment().name(),
                mine.alignment() == Alignment.GOOD ? "正义阵营" : "邪恶阵营", mine.confirmed(), instruction,
                visibilityService.visiblePlayers(mine.id(), mine.role(), all));
    }

    @Transactional
    public GameState confirmRole(long userId, long gameId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.ROLE_CONFIRM);
        repository.confirmRole(gameId, c.player.id());
        if (repository.confirmedCount(gameId) == repository.players(gameId).size()) repository.setPhase(gameId, Phase.TEAM_BUILDING);
        events.publish(gameId, "ROLE_CONFIRMED");
        return state(userId, gameId);
    }

    @Transactional
    public GameState submitTeam(long userId, long gameId, List<Long> playerIds) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.TEAM_BUILDING);
        GameActionPolicy.requireLeader(c.player.id(), c.game.leaderGamePlayerId());
        GameRuleConfig config = GameRuleConfig.forPlayers(c.game.playerCount());
        GameActionPolicy.requireTeamSize(playerIds, config.teamSize(c.game.missionNo()));
        for (Long id : playerIds) repository.gamePlayer(gameId, id)
                .orElseThrow(() -> new BusinessException("PARAM_ERROR", "队伍中包含无效玩家"));
        repository.insertProposal(gameId, c.game.missionNo(), c.game.proposalNo(), c.player.id(),
                playerIds.stream().sorted().toList());
        repository.setPhase(gameId, Phase.TEAM_VOTING);
        events.publish(gameId, "TEAM_SUBMITTED");
        return state(userId, gameId);
    }

    @Transactional
    public GameState vote(long userId, long gameId, VoteChoice choice) {
        if (choice == null) throw new BusinessException("PARAM_ERROR", "请选择赞成或反对");
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.TEAM_VOTING);
        ProposalRow proposal = currentProposal(c.game);
        try { repository.insertVote(proposal.id(), c.player.id(), choice); }
        catch (DuplicateKeyException e) { throw new BusinessException("DUPLICATE_ACTION", "你已经投过票了"); }
        int playerCount = repository.players(gameId).size();
        if (repository.voteCount(proposal.id()) == playerCount) {
            int approvals = repository.approveCount(proposal.id());
            boolean approved = GameRulesEngine.teamApproved(approvals, playerCount);
            repository.resolveProposal(proposal.id(), approved, approvals, playerCount - approvals);
            if (approved) {
                GameRuleConfig config = GameRuleConfig.forPlayers(playerCount);
                repository.insertMission(gameId, c.game.missionNo(), proposal.id(), config.teamSize(c.game.missionNo()),
                        config.failThreshold(c.game.missionNo()));
                repository.setPhase(gameId, Phase.MISSION_EXECUTING);
                events.publish(gameId, "TEAM_APPROVED");
                events.publish(gameId, "MISSION_STARTED");
            } else {
                int rejections = c.game.rejections() + 1;
                if (rejections >= GameRuleConfig.forPlayers(playerCount).rejectedTeamsToEvilWin()) {
                    repository.finish(gameId, Winner.EVIL, "FIVE_REJECTED_TEAMS", null);
                    events.publish(gameId, "GAME_FINISHED");
                } else {
                    repository.updateAfterRejectedTeam(gameId, c.game.proposalNo() + 1, rejections, nextLeader(c.game));
                    events.publish(gameId, "TEAM_REJECTED");
                }
            }
            events.publish(gameId, "VOTE_COMPLETED");
        }
        return state(userId, gameId);
    }

    @Transactional
    public GameState mission(long userId, long gameId, MissionChoice choice) {
        if (choice == null) throw new BusinessException("PARAM_ERROR", "请选择任务结果");
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.MISSION_EXECUTING);
        MissionRow mission = currentMission(c.game);
        ProposalRow proposal = repository.proposal(mission.approvedProposalId())
                .orElseThrow(() -> new BusinessException("任务提案不存在"));
        List<Long> team = proposal.teamPlayerIds();
        GameActionPolicy.requireMissionMember(c.player.id(), team);
        GameActionPolicy.requireMissionChoice(c.player.role(), choice);
        try { repository.insertMissionAction(mission.id(), c.player.id(), choice); }
        catch (DuplicateKeyException e) { throw new BusinessException("DUPLICATE_ACTION", "你已经提交过任务了"); }
        if (repository.actionCount(mission.id()) == team.size()) {
            int fails = repository.failCount(mission.id());
            int successes = team.size() - fails;
            boolean failed = fails >= mission.failThreshold();
            repository.completeMission(mission.id(), successes, fails, failed);
            int goodScore = c.game.goodScore() + (failed ? 0 : 1);
            int evilScore = c.game.evilScore() + (failed ? 1 : 0);
            GameRulesEngine.MissionTransition transition = GameRulesEngine.transitionAfterMission(
                    GameRuleConfig.forPlayers(c.game.playerCount()), c.game.missionNo(), goodScore, evilScore);
            if (transition.phase() == Phase.FINISHED) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.FINISHED);
                repository.finish(gameId, Winner.EVIL, "THREE_FAILED_MISSIONS", null);
                events.publish(gameId, "GAME_FINISHED");
            } else if (transition.phase() == Phase.LADY_OF_LAKE) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.LADY_OF_LAKE);
                events.publish(gameId, "LADY_OF_LAKE_STARTED");
            } else if (transition.phase() == Phase.ASSASSINATION) {
                repository.applyMissionScore(gameId, goodScore, evilScore, Phase.ASSASSINATION);
                events.publish(gameId, "ASSASSINATION_STARTED");
            } else {
                repository.advanceAfterMission(gameId, goodScore, evilScore, c.game.missionNo() + 1, nextLeader(c.game));
                events.publish(gameId, "ROUND_CHANGED");
            }
            events.publish(gameId, "MISSION_COMPLETED");
        }
        return state(userId, gameId);
    }

    @Transactional
    public LadyInspectionResult inspectWithLady(long userId, long gameId, long targetPlayerId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.LADY_OF_LAKE);
        GameActionPolicy.requireLadyHolder(c.player.id(), c.game.ladyHolderGamePlayerId());
        int used = repository.ladyActionCount(gameId);
        if (used >= 3) throw new BusinessException("INVALID_PHASE", "湖中仙女本局已经使用三次");
        List<GamePlayerRow> gamePlayers = repository.gamePlayers(gameId);
        Set<Long> playerIds = gamePlayers.stream().map(GamePlayerRow::id).collect(Collectors.toSet());
        Set<Long> holderHistory = repository.ladyHolderHistory(gameId);
        GameActionPolicy.requireLadyTarget(c.player.id(), targetPlayerId, playerIds, holderHistory);
        GamePlayerRow target = gamePlayers.stream().filter(p -> p.id() == targetPlayerId).findFirst()
                .orElseThrow(() -> new BusinessException("PARAM_ERROR", "目标玩家不在当前游戏"));
        repository.insertLadyAction(gameId, used + 1, c.player.id(), targetPlayerId, target.alignment());
        repository.updateLadyHolder(gameId, targetPlayerId);
        Phase next = GameRulesEngine.phaseAfterLady(c.game.goodScore());
        if (next == Phase.ASSASSINATION) {
            repository.setPhase(gameId, Phase.ASSASSINATION);
            events.publish(gameId, "ASSASSINATION_STARTED");
        } else {
            repository.advanceRound(gameId, c.game.missionNo() + 1, nextLeader(c.game));
            events.publish(gameId, "ROUND_CHANGED");
        }
        events.publish(gameId, "LADY_OF_LAKE_COMPLETED");
        return new LadyInspectionResult(target.id(), requireSeat(target), target.nickname(), target.alignment().name());
    }

    @Transactional
    public GameState assassinate(long userId, long gameId, long targetPlayerId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.ASSASSINATION);
        if (c.player.role() != Role.ASSASSIN) throw new BusinessException("FORBIDDEN", "只有刺客可以选择刺杀目标");
        if (targetPlayerId == c.player.id()) throw new BusinessException("PARAM_ERROR", "不能刺杀自己");
        GamePlayerRow target = repository.gamePlayer(gameId, targetPlayerId)
                .orElseThrow(() -> new BusinessException("PARAM_ERROR", "目标玩家不在当前房间"));
        Winner winner = GameRulesEngine.assassinationWinner(target.role());
        repository.finish(gameId, winner, target.role() == Role.MERLIN ? "MERLIN_ASSASSINATED" : "ASSASSINATION_MISSED", target.id());
        events.publish(gameId, "GAME_FINISHED");
        return state(userId, gameId);
    }

    @Transactional
    public RoomService.RoomView restart(long userId, long gameId) {
        Context c = context(userId, gameId, true);
        GameActionPolicy.requirePhase(c.game.phase(), Phase.FINISHED);
        if (c.game.ownerUserId() != userId) throw new BusinessException("FORBIDDEN", "只有房主可以再来一局");
        List<GamePlayerRow> oldPlayers = repository.players(gameId);
        GameActionPolicy.requireRestartPlayerCount(oldPlayers.size(), c.game.playerCount());
        long newGameId = repository.insertWaitingGame(c.game.code(), c.game.ownerUserId(), c.game.playerCount());
        for (GamePlayerRow old : oldPlayers) repository.insertGamePlayer(newGameId, old.userId(), old.nickname(), old.seatNo());
        repository.archiveGamePlayers(gameId);
        repository.deleteBotTestGame(gameId);
        events.publish(gameId, "REMATCH_CREATED");
        events.publish(newGameId, "REMATCH_CREATED");
        return roomService.get(userId, newGameId);
    }

    @Transactional
    public EndResult end(long userId, long gameId) {
        GameRow game = roomService.requireRoom(gameId, true);
        roomService.requireHost(userId, game);
        if ("FINISHED".equals(game.status()) || "CLOSED".equals(game.status())) return new EndResult("CLOSED".equals(game.status()));
        if (repository.isBotGame(gameId)) {
            repository.closeGame(gameId);
            repository.deleteBotTestGame(gameId);
            events.publish(gameId, "ROOM_CLOSED");
            return new EndResult(true);
        }
        if ("WAITING".equals(game.status())) {
            repository.closeGame(gameId);
            events.publish(gameId, "ROOM_CLOSED");
            return new EndResult(true);
        } else if ("PLAYING".equals(game.status())) {
            repository.finish(gameId, null, "HOST_ENDED", null);
            events.publish(gameId, "GAME_FINISHED");
            return new EndResult(false);
        } else throw new BusinessException("INVALID_PHASE", "当前房间不能结束");
    }

    @Transactional(readOnly = true)
    public GameState state(long userId, long gameId) {
        Context c = context(userId, gameId, false);
        List<GamePlayerRow> players = repository.players(gameId);
        GameRuleConfig config = GameRuleConfig.forPlayers(c.game.playerCount());
        GamePlayerRow leader = repository.gamePlayerById(c.game.leaderGamePlayerId()).orElseThrow();
        ProposalRow proposal = repository.currentProposal(gameId, c.game.missionNo(), c.game.proposalNo()).orElse(null);
        MissionRow mission = repository.currentMission(gameId, c.game.missionNo()).orElse(null);
        MissionRow latestMission = repository.latestCompletedMission(gameId).orElse(null);
        List<Long> team = proposal == null ? List.of() : proposal.teamPlayerIds();
        int voteCount = proposal == null ? 0 : repository.voteCount(proposal.id());
        List<VoteView> votes = proposal != null && voteCount == players.size() ? repository.votes(proposal.id()) : List.of();
        boolean hasVoted = proposal != null && repository.hasVote(proposal.id(), c.player.id());
        boolean hasSubmittedMission = mission != null && repository.hasAction(mission.id(), c.player.id());
        ProposalRow latestResolved = repository.latestResolvedProposal(gameId).orElse(null);
        TeamVoteResult latestVoteResult = latestResolved == null ? null : new TeamVoteResult(latestResolved.missionNo(),
                latestResolved.proposalNo(), "APPROVED".equals(latestResolved.status()), repository.votes(latestResolved.id()));
        List<PublicIdentity> identities = c.game.phase() == Phase.FINISHED ? repository.gamePlayers(gameId).stream()
                .map(gp -> new PublicIdentity(gp.id(), requireSeat(gp), gp.nickname(), gp.role().label(), gp.alignment().name()))
                .sorted(Comparator.comparingInt(PublicIdentity::seatNo)).toList() : List.of();
        MissionResult result = latestMission == null ? null : new MissionResult(latestMission.missionNo(),
                latestMission.successCount(), latestMission.failCount(), latestMission.status());
        GamePlayerRow ladyHolder = c.game.ladyHolderGamePlayerId() == null ? null
                : repository.gamePlayerById(c.game.ladyHolderGamePlayerId()).orElse(null);
        int ladyUsedCount = config.ladyOfLake() ? repository.ladyActionCount(gameId) : 0;
        boolean isLadyHolder = c.game.phase() == Phase.LADY_OF_LAKE && Objects.equals(c.game.ladyHolderGamePlayerId(), c.player.id());
        List<Long> ladyEligibleTargetIds = List.of();
        if (isLadyHolder) {
            Set<Long> previousHolders = repository.ladyHolderHistory(gameId);
            ladyEligibleTargetIds = repository.gamePlayers(gameId).stream().map(GamePlayerRow::id)
                    .filter(id -> id != c.player.id() && !previousHolders.contains(id)).toList();
        }
        return new GameState(gameId, gameId, c.game.phase().name(), c.game.missionNo(), c.game.proposalNo(), c.game.rejections(),
                c.game.goodScore(), c.game.evilScore(), leader.id(), requireSeat(leader), leader.nickname(),
                c.game.missionNo() <= 5 ? config.teamSize(c.game.missionNo()) : 0, config.rejectedTeamsToEvilWin(),
                repository.confirmedCount(gameId), players.size(), team, voteCount, votes, hasVoted, hasSubmittedMission,
                team.contains(c.player.id()), latestVoteResult, c.player.alignment() == Alignment.EVIL,
                c.player.role() == Role.ASSASSIN, result, config.ladyOfLake(), c.game.ladyHolderGamePlayerId(),
                ladyHolder == null ? null : requireSeat(ladyHolder), ladyHolder == null ? null : ladyHolder.nickname(),
                isLadyHolder, ladyUsedCount, ladyEligibleTargetIds,
                c.game.winner() == null ? null : c.game.winner().name(), identities, c.game.finishReason());
    }

    private Context context(long userId, long gameId, boolean lock) {
        GameRow game = repository.game(gameId, lock).orElseThrow(() -> new BusinessException("NOT_FOUND", "对局不存在"));
        return new Context(game, roomService.requirePlayer(game.id(), userId));
    }
    private ProposalRow currentProposal(GameRow game) {
        return repository.currentProposal(game.id(), game.missionNo(), game.proposalNo())
                .orElseThrow(() -> new BusinessException("任务提案不存在"));
    }
    private MissionRow currentMission(GameRow game) {
        return repository.currentMission(game.id(), game.missionNo()).orElseThrow(() -> new BusinessException("任务不存在"));
    }
    private long nextLeader(GameRow game) {
        List<GamePlayerRow> players = repository.players(game.id());
        GamePlayerRow leader = repository.gamePlayerById(game.leaderGamePlayerId()).orElseThrow();
        int nextSeat = GameRulesEngine.nextSeat(requireSeat(leader), game.playerCount());
        return players.stream().filter(p -> Objects.equals(p.seatNo(), nextSeat)).findFirst()
                .orElseThrow(() -> new IllegalStateException("正式游戏座位不完整")).id();
    }

    private void requireCompleteSeating(List<GamePlayerRow> players, int maxPlayers) {
        Set<Integer> seats = players.stream().map(GamePlayerRow::seatNo).filter(Objects::nonNull).collect(Collectors.toSet());
        boolean complete = seats.size() == maxPlayers
                && seats.containsAll(java.util.stream.IntStream.rangeClosed(1, maxPlayers).boxed().toList());
        if (!complete) throw new BusinessException("SEATS_INCOMPLETE", "所有玩家入座后才能开始游戏");
    }

    private int requireSeat(GamePlayerRow player) {
        if (player.seatNo() == null) throw new IllegalStateException("正式游戏玩家缺少座位");
        return player.seatNo();
    }

    private record Context(GameRow game, GamePlayerRow player) {}
    public record EndResult(boolean closed) {}
    public record MyRoleView(String roleCode, String roleName, String alignmentCode, String alignmentName,
                             boolean confirmed, String instruction, List<RoleVisibilityService.VisiblePlayer> visiblePlayers) {}
    public record MissionResult(int missionNo, Integer successCount, Integer failCount, String status) {}
    public record TeamVoteResult(int missionNo, int proposalNo, boolean approved, List<VoteView> votes) {}
    public record PublicIdentity(long playerId, int seatNo, String nickname, String roleName, String alignment) {}
    public record LadyInspectionResult(long targetPlayerId, int targetSeatNo, String targetNickname, String alignment) {}
    public record GameState(long gameId, long roomId, String phase, int missionNo, int proposalNo,
                            int consecutiveRejections, int goodScore, int evilScore, long leaderPlayerId,
                            int leaderSeatNo, String leaderNickname, int requiredTeamSize, int maxRejections,
                            int confirmedCount, int playerCount, List<Long> selectedPlayerIds, int voteCount,
                            List<VoteView> votes, boolean hasVoted, boolean hasSubmittedMission, boolean onMission,
                            TeamVoteResult latestVoteResult, boolean evil, boolean assassin,
                            MissionResult latestMissionResult, boolean ladyEnabled, Long ladyHolderPlayerId,
                            Integer ladyHolderSeatNo, String ladyHolderNickname, boolean ladyHolder,
                            int ladyUsedCount, List<Long> ladyEligibleTargetIds, String winner, List<PublicIdentity> identities,
                            String finishReason) {}
    public record TeamRequest(List<Long> playerIds) {}
    public record VoteRequest(VoteChoice choice) {}
    public record MissionRequest(MissionChoice choice) {}
    public record LadyInspectionRequest(long targetPlayerId) {}
    public record AssassinateRequest(long targetPlayerId) {}
}
