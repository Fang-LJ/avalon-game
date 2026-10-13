package com.avalon.game.realtime;

import com.avalon.game.game.TeamDraft;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class RoomEventPublisher {
    private final ApplicationEventPublisher publisher;
    public RoomEventPublisher(ApplicationEventPublisher publisher) { this.publisher = publisher; }
    public void publish(long roomId, String type) {
        publish(new RoomEvent(roomId, type));
    }
    public void publishTeamDraft(long roomId, TeamDraft draft) {
        publish(new RoomEvent(roomId, "TEAM_DRAFT_UPDATED", draft));
    }
    private void publish(RoomEvent event) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { publisher.publishEvent(event); }
            });
        } else publisher.publishEvent(event);
    }
    public record RoomEvent(long roomId, String type, TeamDraft teamDraft) {
        public RoomEvent(long roomId, String type) { this(roomId, type, null); }
    }
}
