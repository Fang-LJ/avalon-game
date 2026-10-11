package com.avalon.game.game;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Single-server, short-lived UI selections. Never written to game history or SQL. */
final class AssassinationDrafts {
    private final Clock clock;
    private final AtomicLong revisions = new AtomicLong();
    private final ConcurrentHashMap<Long, Draft> drafts = new ConcurrentHashMap<>();
    private static final long TTL = Duration.ofHours(12).toMillis();

    AssassinationDrafts() { this(Clock.systemUTC()); }
    AssassinationDrafts(Clock clock) { this.clock = clock; }

    private long nextRevision() { return revisions.updateAndGet(old -> Math.max(old + 1, clock.millis())); }
    Draft prepare(long playerId) { return new Draft(playerId, nextRevision(), clock.millis() + TTL); }
    Draft get(long gameId) {
        Draft draft = drafts.get(gameId);
        if (draft != null && draft.expiresAt() > clock.millis()) return draft;
        if (draft != null) drafts.remove(gameId, draft);
        return new Draft(null, nextRevision(), 0);
    }
    void commit(long gameId, Draft draft) {
        afterCommit(() -> drafts.compute(gameId, (id, current) ->
                current == null || current.revision() < draft.revision() ? draft : current));
    }
    void clear(long gameId) { afterCommit(() -> drafts.remove(gameId)); }
    void cleanup() { drafts.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= clock.millis()); }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else action.run();
    }
    record Draft(Long playerId, long revision, long expiresAt) {}
}
