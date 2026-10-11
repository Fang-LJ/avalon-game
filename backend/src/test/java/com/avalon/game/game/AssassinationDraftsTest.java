package com.avalon.game.game;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;

class AssassinationDraftsTest {
    @Test void onlyCommitPublishesSelectionAndRollbackDoesNot() {
        var drafts = new AssassinationDrafts();
        var target = drafts.prepare(3);
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            drafts.commit(7,target);
            assertNull(drafts.get(7).playerId());
            TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(1));
            assertNull(drafts.get(7).playerId());
            TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCommit());
            assertEquals(3L,drafts.get(7).playerId());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }
    @Test void delayedCommitCannotReplaceANewerSelectionAndGamesAreIsolated() {
        var drafts = new AssassinationDrafts();
        var old = drafts.prepare(3); var latest = drafts.prepare(4);
        drafts.commit(7,latest); drafts.commit(7,old);
        assertEquals(4L,drafts.get(7).playerId()); assertNull(drafts.get(8).playerId());
        drafts.clear(7); assertNull(drafts.get(7).playerId());
    }
    @Test void expiredSelectionsAreRemovedAndDoNotBecomeHistory() {
        class MutableClock extends Clock {
            Instant time = Instant.parse("2026-10-11T00:00:00Z");
            public ZoneId getZone(){return ZoneOffset.UTC;}
            public Clock withZone(ZoneId zone){return this;}
            public Instant instant(){return time;}
        }
        var clock = new MutableClock(); var drafts = new AssassinationDrafts(clock);
        drafts.commit(7,drafts.prepare(3));
        clock.time=clock.time.plus(Duration.ofHours(12)); drafts.cleanup();
        assertNull(drafts.get(7).playerId());
    }
}
