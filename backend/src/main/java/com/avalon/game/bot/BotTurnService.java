package com.avalon.game.bot;

import com.avalon.game.game.AvalonRepository;
import com.avalon.game.game.AvalonRepository.*;
import com.avalon.game.game.GameRuleConfig;
import com.avalon.game.game.GameService;
import com.avalon.game.game.GameTypes.Alignment;
import com.avalon.game.game.GameTypes.Role;
import com.avalon.game.realtime.RoomEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

@Service
public class BotTurnService {
    private final AvalonRepository repository;
    private final GameService games;
    private final BotStrategy strategy;
    private final RoomEventPublisher events;

    public BotTurnService(AvalonRepository repository, GameService games, BotStrategy strategy, RoomEventPublisher events) {
        this.repository = repository; this.games = games; this.strategy = strategy; this.events = events;
    }

    /** One action per tick. Lock and re-read before acting, including after a host ends the game. */
    @Transactional
    public void act(long gameId) {
        GameRow game = repository.game(gameId, true).orElse(null);
        if (game == null || !"PLAYING".equals(game.status()) || game.phase() == null) return;
        Set<Long> botUsers = repository.botUserIds(gameId);
        List<GamePlayerRow> players = repository.players(gameId);
        List<GamePlayerRow> bots = players.stream().filter(p -> botUsers.contains(p.userId())).toList();
        switch (game.phase()) {
            case ROLE_CONFIRM -> bots.stream().filter(p -> !p.confirmed()).findFirst()
                    .ifPresent(bot -> games.confirmRole(bot.userId(), gameId));
            case TEAM_BUILDING -> bots.stream().filter(p -> Long.valueOf(p.id()).equals(game.leaderGamePlayerId())).findFirst()
                    .ifPresent(bot -> games.submitTeam(bot.userId(), gameId,
                            strategy.team(bot.id(), players.stream().map(GamePlayerRow::id).toList(),
                                    GameRuleConfig.forPlayers(game.playerCount()).teamSize(game.missionNo()))));
            case TEAM_VOTING -> repository.currentProposal(gameId, game.missionNo(), game.proposalNo()).ifPresent(proposal -> bots.stream()
                    .filter(p -> !repository.hasVote(proposal.id(), p.id())).findFirst()
                    .ifPresent(bot -> games.vote(bot.userId(), gameId, strategy.vote())));
            case MISSION_EXECUTING -> repository.currentMission(gameId, game.missionNo()).ifPresent(mission -> repository.currentProposal(gameId, game.missionNo(), game.proposalNo())
                    .ifPresent(proposal -> bots.stream().filter(p -> proposal.teamPlayerIds().contains(p.id()))
                            .filter(p -> !repository.hasAction(mission.id(), p.id())).findFirst()
                            .ifPresent(bot -> games.mission(bot.userId(), gameId, strategy.mission(bot.alignment())))));
            case LADY_OF_LAKE -> bots.stream().filter(p -> Long.valueOf(p.id()).equals(game.ladyHolderGamePlayerId())).findFirst()
                    .ifPresent(bot -> {
                        Set<Long> history = repository.ladyHolderHistory(gameId);
                        List<Long> eligible = players.stream().filter(p -> p.id() != bot.id() && !history.contains(p.id()))
                                .map(GamePlayerRow::id).toList();
                        if (!eligible.isEmpty()) games.inspectWithLady(bot.userId(), gameId, strategy.target(eligible));
                        // Inspection results stay private; never store them in a public event or log.
                    });
            case ASSASSINATION -> bots.stream().filter(p -> p.role() == Role.ASSASSIN).findFirst()
                    .ifPresent(bot -> games.assassinate(bot.userId(), gameId,
                            strategy.target(players.stream().filter(p -> p.alignment() == Alignment.GOOD)
                                    .map(GamePlayerRow::id).toList())));
            default -> { /* FINISHED and legacy phases have no automated action. */ }
        }
    }

    @Transactional
    public void cleanUp(long gameId) {
        GameRow game = repository.game(gameId, true).orElse(null);
        if (game == null || !("FINISHED".equals(game.status()) || "CLOSED".equals(game.status()))) return;
        if (!repository.expiredBotGameIds().contains(gameId)) return;
        repository.deleteBotTestGame(gameId);
        events.publish(gameId, "ROOM_CLOSED");
    }
}
