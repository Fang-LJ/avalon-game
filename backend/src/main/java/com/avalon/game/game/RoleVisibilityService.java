package com.avalon.game.game;

import com.avalon.game.game.GameTypes.*;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RoleVisibilityService {
    public List<VisiblePlayer> visiblePlayers(Role viewer, List<RolePlayer> all) {
        return switch (viewer) {
            case MERLIN -> all.stream().filter(p -> p.role().alignment() == Alignment.EVIL)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), "邪恶阵营")).toList();
            case PERCIVAL -> all.stream().filter(p -> p.role() == Role.MERLIN || p.role() == Role.MORGANA)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), "梅林候选人")).toList();
            case MORGANA, ASSASSIN -> all.stream().filter(p -> p.role().alignment() == Alignment.EVIL && p.role() != Role.OBERON && p.role() != viewer)
                    .map(p -> new VisiblePlayer(p.playerId(), p.seatNo(), p.nickname(), "邪恶同伴")).toList();
            default -> List.of();
        };
    }
    public record RolePlayer(Long playerId, int seatNo, String nickname, Role role) {}
    public record VisiblePlayer(Long playerId, int seatNo, String nickname, String hint) {}
}
