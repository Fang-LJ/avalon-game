package com.avalon.game.game;

import com.avalon.game.game.GameTypes.Role;
import com.avalon.game.game.RoleVisibilityService.KnowledgeType;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class RoleVisibilityServiceTest {
    private final RoleVisibilityService service = new RoleVisibilityService();
    private final List<RoleVisibilityService.RolePlayer> players = List.of(
            p(1, Role.MERLIN), p(2, Role.PERCIVAL), p(3, Role.LOYAL_SERVANT), p(4, Role.MORGANA),
            p(5, Role.ASSASSIN), p(6, Role.MINION), p(7, Role.MORDRED), p(8, Role.OBERON));
    @Test void merlinSeesOberonAndMinionButNotMordredOrSpecificRoles() {
        var view = service.visiblePlayers(1, Role.MERLIN, players);
        assertEquals(List.of(4L,5L,6L,8L), ids(view));
        assertTrue(view.stream().allMatch(v -> v.knowledgeType()==KnowledgeType.EVIL && v.hint().equals("邪恶阵营")));
    }
    @Test void percivalSeesOnlyIndistinguishableMerlinAndMorganaCandidates() {
        var view = service.visiblePlayers(2, Role.PERCIVAL, players);
        assertEquals(List.of(1L,4L), ids(view));
        assertTrue(view.stream().allMatch(v -> v.knowledgeType()==KnowledgeType.MERLIN_OR_MORGANA));
        assertEquals(1, view.stream().map(v -> v.knowledgeType()+":"+v.hint()).distinct().count());
    }
    @Test void ordinaryEvilSeesOtherOrdinaryEvilButNeverOberonOrSpecificRoles() {
        for (long viewerId : List.of(4L, 5L, 6L, 7L)) {
            Role role = players.stream().filter(player -> player.playerId() == viewerId).findFirst().orElseThrow().role();
            var view = service.visiblePlayers(viewerId, role, players);
            assertFalse(ids(view).contains(8L));
            assertFalse(ids(view).contains(viewerId));
            assertTrue(view.stream().allMatch(v -> v.knowledgeType()==KnowledgeType.EVIL_ALLY && v.hint().equals("邪恶同伴")));
        }
        assertEquals(List.of(4L,5L,7L), ids(service.visiblePlayers(6, Role.MINION, players)));
    }
    @Test void oberonAndGoodPlayersWithoutInformationSeeNobody() {
        assertTrue(service.visiblePlayers(8, Role.OBERON, players).isEmpty()); assertTrue(service.visiblePlayers(3, Role.LOYAL_SERVANT, players).isEmpty());
    }
    private List<Long> ids(List<RoleVisibilityService.VisiblePlayer> view) { return view.stream().map(RoleVisibilityService.VisiblePlayer::playerId).toList(); }
    private RoleVisibilityService.RolePlayer p(long id, Role role) { return new RoleVisibilityService.RolePlayer(id, (int) id, "P" + id, role); }
}
