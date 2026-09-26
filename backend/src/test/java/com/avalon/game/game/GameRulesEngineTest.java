package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class GameRulesEngineTest {
    @Test void sixPlayerRolesAndQuestsAreCorrect() {
        GameRuleConfig c = GameRuleConfig.forPlayers(6);
        assertEquals(6, c.roles().size()); assertEquals(List.of(2,3,4,3,4), c.teamSizes());
        assertEquals(4, c.roles().stream().filter(r -> r.alignment() == Alignment.GOOD).count());
        assertEquals(2, c.roles().stream().filter(r -> r.alignment() == Alignment.EVIL).count());
    }
    @Test void sevenPlayerRolesAndQuestsAreCorrect() {
        GameRuleConfig c = GameRuleConfig.forPlayers(7);
        assertEquals(List.of(2,3,3,4,4), c.teamSizes()); assertEquals(List.of(1,1,1,2,1), c.failThresholds());
        assertTrue(c.roles().contains(Role.OBERON));
    }
    @Test void eightPlayerRolesAndQuestsAreCorrect() {
        GameRuleConfig c = GameRuleConfig.forPlayers(8);
        assertEquals(List.of(3,4,4,5,5), c.teamSizes()); assertEquals(5, c.roles().stream().filter(r -> r.alignment() == Alignment.GOOD).count());
    }
    @Test void shuffleNeverAddsOrDropsRolesAndVariesByGame() {
        GameRuleConfig c = GameRuleConfig.forPlayers(8);
        List<Role> first = GameRulesEngine.shuffledRoles(c, new Random(1));
        List<Role> second = GameRulesEngine.shuffledRoles(c, new Random(2));
        assertNotEquals(first, second);
        assertEquals(frequencies(c.roles()), frequencies(first)); assertEquals(frequencies(c.roles()), frequencies(second));
    }
    @Test void voteNeedsStrictMajority() {
        assertFalse(GameRulesEngine.teamApproved(3, 6)); assertTrue(GameRulesEngine.teamApproved(4, 6));
        assertFalse(GameRulesEngine.teamApproved(3, 7)); assertTrue(GameRulesEngine.teamApproved(4, 7));
    }
    @Test void onlyFourthQuestAtSevenPlusNeedsTwoFails() {
        GameRuleConfig c = GameRuleConfig.forPlayers(7);
        assertFalse(GameRulesEngine.missionFailed(1, c, 4)); assertTrue(GameRulesEngine.missionFailed(2, c, 4));
        assertTrue(GameRulesEngine.missionFailed(1, c, 5));
    }
    @Test void leaderRotationWrapsAround() {
        assertEquals(4, GameRulesEngine.nextSeat(3, 7)); assertEquals(1, GameRulesEngine.nextSeat(7, 7));
    }
    @Test void threeFailedMissionsProduceEvilWinnerButThreeSuccessesNeedAssassination() {
        assertEquals(Winner.EVIL, GameRulesEngine.missionWinner(1, 3)); assertNull(GameRulesEngine.missionWinner(3, 1));
        assertEquals(Phase.FINISHED, GameRulesEngine.phaseAfterMission(1, 3));
        assertEquals(Phase.ASSASSINATION, GameRulesEngine.phaseAfterMission(3, 1));
    }
    @Test void assassinWinsOnlyWhenTargetingMerlin() {
        assertEquals(Winner.EVIL, GameRulesEngine.assassinationWinner(Role.MERLIN));
        assertEquals(Winner.GOOD, GameRulesEngine.assassinationWinner(Role.PERCIVAL));
    }
    @Test void fiveRejectedTeamsIsConfigured() { assertEquals(5, GameRuleConfig.forPlayers(6).rejectedTeamsToEvilWin()); }
    @Test void unsupportedPlayerCountsAreRejected() { assertThrows(BusinessException.class, () -> GameRuleConfig.forPlayers(5)); }
    private Map<Role,Long> frequencies(List<Role> roles) {
        Map<Role,Long> result = new EnumMap<>(Role.class); roles.forEach(r -> result.merge(r, 1L, Long::sum)); return result;
    }
}
