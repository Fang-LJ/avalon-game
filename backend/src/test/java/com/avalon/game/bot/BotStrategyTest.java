package com.avalon.game.bot;

import com.avalon.game.game.GameTypes.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.random.RandomGenerator;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BotStrategyTest {
    @Test void voteHasExactlySeventyApproveOutcomesOutOfOneHundred() {
        RandomGenerator random = mock(RandomGenerator.class);
        BotStrategy strategy = new BotStrategy(random);
        int approvals = 0;
        for (int draw = 0; draw < 100; draw++) {
            when(random.nextInt(100)).thenReturn(draw);
            if (strategy.vote() == VoteChoice.APPROVE) approvals++;
        }
        assertEquals(70, approvals);
    }
    @Test void evilMissionHasExactlySeventyFailOutcomesOutOfOneHundred() {
        RandomGenerator random = mock(RandomGenerator.class);
        BotStrategy strategy = new BotStrategy(random);
        int failures = 0;
        for (int draw = 0; draw < 100; draw++) {
            when(random.nextInt(100)).thenReturn(draw);
            if (strategy.mission(Alignment.EVIL) == MissionChoice.FAIL) failures++;
        }
        assertEquals(70, failures);
    }
    @Test void goodAlwaysSucceedsWithoutConsultingRandomness() {
        RandomGenerator random = mock(RandomGenerator.class);
        assertEquals(MissionChoice.SUCCESS, new BotStrategy(random).mission(Alignment.GOOD));
        verifyNoInteractions(random);
    }
    @Test void leaderAlwaysIncludesItselfAndChoosesDistinctOtherPlayers() {
        BotStrategy strategy = new BotStrategy(new java.util.Random(17));
        for (int i = 0; i < 100; i++) {
            List<Long> team = strategy.team(3, List.of(1L, 2L, 3L, 4L, 5L), 3);
            assertEquals(3, team.size());
            assertTrue(team.contains(3L));
            assertEquals(3, team.stream().distinct().count());
        }
    }
    @Test void randomTargetMustBeOneOfTheEligiblePlayers() {
        BotStrategy strategy = new BotStrategy(new java.util.Random(18));
        for (int i = 0; i < 100; i++) assertTrue(List.of(2L,4L).contains(strategy.target(List.of(2L,4L))));
        assertThrows(IllegalArgumentException.class, () -> strategy.target(List.of()));
    }
}
