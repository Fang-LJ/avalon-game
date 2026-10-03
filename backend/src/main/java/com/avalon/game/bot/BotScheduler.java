package com.avalon.game.bot;

import com.avalon.game.game.AvalonRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class BotScheduler {
    private static final Logger log = LoggerFactory.getLogger(BotScheduler.class);
    private final AvalonRepository repository;
    private final BotTurnService turns;
    public BotScheduler(AvalonRepository repository, BotTurnService turns) {
        this.repository = repository; this.turns = turns;
    }

    @Scheduled(fixedDelayString = "${avalon.bots.tick-ms:1000}", initialDelayString = "${avalon.bots.initial-delay-ms:5000}")
    public void tick() {
        // Persistent state, not browser timers: restart/disconnect does not lose bot turns.
        for (long gameId : repository.activeBotGameIds()) {
            try { turns.act(gameId); }
            catch (RuntimeException failure) {
                // Do not log roles, mission choices, tokens, or private inspection results.
                log.warn("Bot action failed for game {} ({})", gameId, failure.getClass().getSimpleName());
            }
        }
    }

    @Scheduled(fixedDelay = 15000, initialDelay = 15000)
    public void cleanUp() {
        for (long gameId : repository.expiredBotGameIds()) {
            try { turns.cleanUp(gameId); }
            catch (RuntimeException failure) {
                log.warn("Bot test cleanup failed for game {} ({})", gameId, failure.getClass().getSimpleName());
            }
        }
    }
}
