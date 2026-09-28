package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameTypes.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

/** Read models intentionally separate public live data from participant-only ended-game secrets. */
@Service
@Transactional(readOnly = true)
public class GameHistoryService {
    private final AvalonRepository repository;
    public GameHistoryService(AvalonRepository repository) { this.repository = repository; }

    public Timeline timeline(long userId, long gameId) {
        List<GamePlayerRow> players = participants(userId, gameId);
        return new Timeline(gameId, proposals(gameId, players), repository.missions(gameId).stream()
                .filter(m -> "SUCCESS".equals(m.status()) || "FAILED".equals(m.status())).toList());
    }

    public Replay replay(long userId, long gameId) {
        GameRow game = repository.game(gameId, false)
                .orElseThrow(() -> new BusinessException("NOT_FOUND", "对局不存在"));
        List<GamePlayerRow> players = participants(userId, gameId);
        if (game.phase() != Phase.FINISHED || !("FINISHED".equals(game.status()) || "CLOSED".equals(game.status())))
            throw new BusinessException("FORBIDDEN", "对局结束后才能查看复盘");
        // Never move these secret queries above the membership and finished checks.
        List<ReplayMission> missions = repository.missions(gameId).stream()
                .map(m -> new ReplayMission(m, repository.missionActions(m.id()))).toList();
        return new Replay(gameId, game.code(), game.playerCount(), game.winner(), game.finishReason(),
                game.startedAt(), game.finishedAt(), game.assassinationTargetGamePlayerId(),
                players.stream().map(p -> new Identity(p.id(), p.seatNo(), p.nickname(), p.role(),
                        p.role() == null ? "" : p.role().label(), p.alignment())).toList(),
                proposals(gameId, players), missions, repository.ladyActions(gameId));
    }

    private List<GamePlayerRow> participants(long userId, long gameId) {
        // Includes archived / left participants; live membership is deliberately not used here.
        List<GamePlayerRow> players = repository.gamePlayers(gameId);
        if (players.stream().noneMatch(p -> p.userId() == userId))
            throw new BusinessException("FORBIDDEN", "只有本局参与者可以查看记录");
        return players;
    }

    private List<PublicProposal> proposals(long gameId, List<GamePlayerRow> players) {
        return repository.proposals(gameId).stream().map(p -> {
            GamePlayerRow leader = players.stream().filter(gp -> gp.id() == p.leaderGamePlayerId()).findFirst().orElseThrow();
            boolean resolved = "APPROVED".equals(p.status()) || "REJECTED".equals(p.status());
            return new PublicProposal(p.id(), p.missionNo(), p.proposalNo(), leader.id(), leader.seatNo(),
                    leader.nickname(), p.teamPlayerIds(), p.status(), resolved ? p.approveCount() : null,
                    resolved ? p.rejectCount() : null, resolved ? repository.votes(p.id()) : List.of());
        }).toList();
    }

    public record PublicProposal(long proposalId, int missionNo, int proposalNo, long leaderPlayerId,
                                 int leaderSeatNo, String leaderNickname, List<Long> teamPlayerIds,
                                 String status, Integer approveCount, Integer rejectCount, List<VoteView> votes) {}
    public record Timeline(long gameId, List<PublicProposal> proposals, List<MissionRow> missions) {}
    public record Identity(long playerId, int seatNo, String nickname, Role roleCode, String roleName, Alignment alignment) {}
    public record ReplayMission(MissionRow mission, List<MissionActionRow> actions) {}
    public record Replay(long gameId, String roomCode, int playerCount, Winner winner, String finishReason,
                         LocalDateTime startedAt, LocalDateTime finishedAt, Long assassinationTargetPlayerId,
                         List<Identity> players, List<PublicProposal> proposals, List<ReplayMission> missions,
                         List<LadyActionRow> ladyActions) {}
}
