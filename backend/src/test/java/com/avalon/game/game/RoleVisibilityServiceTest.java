package com.avalon.game.game;

import com.avalon.game.game.GameTypes.Role;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoleVisibilityServiceTest {
    private final RoleVisibilityService service = new RoleVisibilityService();
    private final List<RoleVisibilityService.RolePlayer> players = List.of(
            p(1, Role.MERLIN), p(2, Role.PERCIVAL), p(3, Role.LOYAL_SERVANT), p(4, Role.LOYAL_SERVANT),
            p(5, Role.MORGANA), p(6, Role.ASSASSIN), p(7, Role.OBERON));
    @Test void merlinSeesEveryEvilPlayerButNotTheirRoles() {
        var view = service.visiblePlayers(Role.MERLIN, players);
        assertEquals(List.of(5L,6L,7L), view.stream().map(RoleVisibilityService.VisiblePlayer::playerId).toList());
        assertTrue(view.stream().allMatch(v -> v.hint().equals("邪恶阵营")));
    }
    @Test void percivalSeesMerlinAndMorganaAsIndistinguishableCandidates() {
        var view = service.visiblePlayers(Role.PERCIVAL, players);
        assertEquals(List.of(1L,5L), view.stream().map(RoleVisibilityService.VisiblePlayer::playerId).toList());
        assertEquals(1, view.stream().map(RoleVisibilityService.VisiblePlayer::hint).distinct().count());
    }
    @Test void normalEvilCannotSeeOberon() {
        var view = service.visiblePlayers(Role.MORGANA, players);
        assertEquals(List.of(6L), view.stream().map(RoleVisibilityService.VisiblePlayer::playerId).toList());
    }
    @Test void oberonAndLoyalServantsSeeNobody() {
        assertTrue(service.visiblePlayers(Role.OBERON, players).isEmpty());
        assertTrue(service.visiblePlayers(Role.LOYAL_SERVANT, players).isEmpty());
    }
    private RoleVisibilityService.RolePlayer p(long id, Role role) { return new RoleVisibilityService.RolePlayer(id, (int) id, "P" + id, role); }
}
