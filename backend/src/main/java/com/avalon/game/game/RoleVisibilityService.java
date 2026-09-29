package com.avalon.game.game;

import com.avalon.game.game.GameTypes.*;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RoleVisibilityService {
    public enum KnowledgeType { EVIL, MERLIN_OR_MORGANA, EVIL_ALLY }

    public List<VisiblePlayer> visiblePlayers(long viewerPlayerId, Role viewer, List<RolePlayer> all) {
        return switch (viewer) {
            case MERLIN -> all.stream().filter(p -> p.role().alignment() == Alignment.EVIL && p.role() != Role.MORDRED)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), KnowledgeType.EVIL, "邪恶阵营")).toList();
            case PERCIVAL -> all.stream().filter(p -> p.role() == Role.MERLIN || p.role() == Role.MORGANA)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), KnowledgeType.MERLIN_OR_MORGANA, "梅林或莫甘娜")).toList();
            case MORGANA, ASSASSIN, MINION, MORDRED -> all.stream()
                    .filter(p -> p.playerId() != viewerPlayerId && p.role().alignment() == Alignment.EVIL && p.role() != Role.OBERON)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), KnowledgeType.EVIL_ALLY, "邪恶同伴")).toList();
            default -> List.of();
        };
    }
    public record RolePlayer(Long playerId, int seatNo, String nickname, Role role) {}
    public record VisiblePlayer(Long playerId, int seatNo, String nickname, KnowledgeType knowledgeType, String hint) {}
}
