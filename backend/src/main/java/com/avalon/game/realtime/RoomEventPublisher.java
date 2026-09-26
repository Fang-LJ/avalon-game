package com.avalon.game.realtime;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class RoomEventPublisher {
    private final ApplicationEventPublisher publisher;
    public RoomEventPublisher(ApplicationEventPublisher publisher) { this.publisher = publisher; }
    public void publish(long roomId, String type) {
        RoomEvent event = new RoomEvent(roomId, type);
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { publisher.publishEvent(event); }
            });
        } else publisher.publishEvent(event);
    }
    public record RoomEvent(long roomId, String type) {}
}
