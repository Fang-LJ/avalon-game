package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class GameRulesEngineTest {
    @Test void allFiveToTenPlayerConfigurationsMatchTheV1Rules() {
        assertConfig(5, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN), List.of(2,3,2,3,3), List.of(1,1,1,1,1), false);
        assertConfig(6, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN), List.of(2,3,4,3,4), List.of(1,1,1,1,1), false);
        assertConfig(7, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.OBERON), List.of(2,3,3,4,4), List.of(1,1,1,2,1), false);
        assertConfig(8, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.MINION), List.of(3,4,4,5,5), List.of(1,1,1,2,1), false);
        assertConfig(9, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.MORDRED), List.of(3,4,4,5,5), List.of(1,1,1,2,1), false);
        assertConfig(10, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.MORDRED, Role.OBERON), List.of(3,4,4,5,5), List.of(1,1,1,2,1), true);
    }
    @Test void eightPlayersUseMinionAndNeverOberon() {
        assertTrue(GameRuleConfig.forPlayers(8).roles().contains(Role.MINION));
        assertFalse(GameRuleConfig.forPlayers(8).roles().contains(Role.OBERON));
        assertFalse(GameRuleConfig.forPlayers(8).roles().contains(Role.MORDRED));
    }
    @Test void fivePlayersContainNoOptionalEvilRolesAndHaveThreeGoodTwoEvil() {
        GameRuleConfig five = GameRuleConfig.forPlayers(5);
        assertFalse(five.roles().contains(Role.MINION));
        assertFalse(five.roles().contains(Role.MORDRED));
        assertFalse(five.roles().contains(Role.OBERON));
        assertEquals(3, five.roles().stream().filter(role -> role.alignment() == Alignment.GOOD).count());
        assertEquals(2, five.roles().stream().filter(role -> role.alignment() == Alignment.EVIL).count());
    }
    @Test void tenPlayersHaveSixGoodFourEvilAndOnlyTenPlayersEnableLady() {
        GameRuleConfig ten = GameRuleConfig.forPlayers(10);
        assertEquals(6, ten.roles().stream().filter(role -> role.alignment() == Alignment.GOOD).count());
        assertEquals(4, ten.roles().stream().filter(role -> role.alignment() == Alignment.EVIL).count());
        for (int players = 5; players <= 9; players++) assertFalse(GameRuleConfig.forPlayers(players).ladyOfLake());
        assertTrue(ten.ladyOfLake());
    }
    @Test void shuffleNeverAddsOrDropsRolesAndVariesByGame() {
        GameRuleConfig c = GameRuleConfig.forPlayers(10);
        List<Role> first = GameRulesEngine.shuffledRoles(c, new Random(1));
        List<Role> second = GameRulesEngine.shuffledRoles(c, new Random(2));
        assertNotEquals(first, second); assertEquals(frequencies(c.roles()), frequencies(first)); assertEquals(frequencies(c.roles()), frequencies(second));
    }
    @Test void voteNeedsStrictMajorityAndFiveRejectionsAreConfigured() {
        assertFalse(GameRulesEngine.teamApproved(3, 6)); assertTrue(GameRulesEngine.teamApproved(4, 6));
        assertFalse(GameRulesEngine.teamApproved(3, 7)); assertTrue(GameRulesEngine.teamApproved(4, 7));
        for (int players = 5; players <= 10; players++) assertEquals(5, GameRuleConfig.forPlayers(players).rejectedTeamsToEvilWin());
    }
    @Test void missionCompletionAutomaticallyAdvancesAndRotatesLeader() {
        for (int players : List.of(5, 8, 10)) {
            var transition = GameRulesEngine.transitionAfterMission(GameRuleConfig.forPlayers(players), 1, 1, 0);
            assertEquals(Phase.TEAM_BUILDING, transition.phase()); assertTrue(transition.advanceRound());
        }
        assertEquals(4, GameRulesEngine.nextSeat(3, 8)); assertEquals(1, GameRulesEngine.nextSeat(8, 8));
    }
    @Test void fourthQuestAtEightPlayersNeedsTwoFails() {
        GameRuleConfig eight = GameRuleConfig.forPlayers(8);
        assertFalse(GameRulesEngine.missionFailed(1, eight, 4));
        assertTrue(GameRulesEngine.missionFailed(2, eight, 4));
    }
    @Test void scoreEndStatesHaveCorrectPrecedence() {
        assertEquals(Phase.FINISHED, GameRulesEngine.transitionAfterMission(GameRuleConfig.forPlayers(10), 3, 1, 3).phase());
        assertEquals(Phase.ASSASSINATION, GameRulesEngine.transitionAfterMission(GameRuleConfig.forPlayers(9), 3, 3, 0).phase());
        assertEquals(Winner.EVIL, GameRulesEngine.missionWinner(1, 3)); assertNull(GameRulesEngine.missionWinner(3, 1));
    }
    @Test void ladyRunsOnlyAfterQuestsTwoThreeAndFourInTenPlayerGames() {
        GameRuleConfig ten = GameRuleConfig.forPlayers(10);
        assertEquals(Phase.TEAM_BUILDING, GameRulesEngine.transitionAfterMission(ten, 1, 1, 0).phase());
        for (int mission : List.of(2, 3, 4)) assertEquals(Phase.LADY_OF_LAKE, GameRulesEngine.transitionAfterMission(ten, mission, 2, 0).phase());
        assertEquals(Phase.TEAM_BUILDING, GameRulesEngine.transitionAfterMission(ten, 5, 2, 2).phase());
    }
    @Test void thirdGoodQuestCompletesLadyBeforeAssassinationButThirdEvilBypassesIt() {
        GameRuleConfig ten = GameRuleConfig.forPlayers(10);
        assertEquals(Phase.LADY_OF_LAKE, GameRulesEngine.transitionAfterMission(ten, 3, 3, 0).phase());
        assertEquals(Phase.ASSASSINATION, GameRulesEngine.phaseAfterLady(3));
        assertEquals(Phase.FINISHED, GameRulesEngine.transitionAfterMission(ten, 3, 1, 3).phase());
    }
    @Test void initialLadyHolderIsImmediatelyRightOfFirstLeader() {
        assertEquals(4, GameRulesEngine.initialLadyHolderSeat(5, 10)); assertEquals(10, GameRulesEngine.initialLadyHolderSeat(1, 10));
    }
    @Test void assassinWinsOnlyWhenTargetingMerlin() {
        assertEquals(Winner.EVIL, GameRulesEngine.assassinationWinner(Role.MERLIN)); assertEquals(Winner.GOOD, GameRulesEngine.assassinationWinner(Role.PERCIVAL));
    }
    @Test void unsupportedPlayerCountsAreRejected() {
        assertThrows(BusinessException.class, () -> GameRuleConfig.forPlayers(4)); assertThrows(BusinessException.class, () -> GameRuleConfig.forPlayers(11));
    }
    private void assertConfig(int players, List<Role> roles, List<Integer> teams, List<Integer> fails, boolean lady) {
        GameRuleConfig actual = GameRuleConfig.forPlayers(players);
        assertEquals(roles, actual.roles()); assertEquals(teams, actual.teamSizes()); assertEquals(fails, actual.failThresholds()); assertEquals(lady, actual.ladyOfLake());
    }
    private Map<Role,Long> frequencies(List<Role> roles) { Map<Role,Long> result = new EnumMap<>(Role.class); roles.forEach(r -> result.merge(r, 1L, Long::sum)); return result; }
}
