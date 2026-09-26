package com.avalon.game.game;

import com.avalon.game.game.GameTypes.*;

import java.util.*;
import java.util.random.RandomGenerator;

public final class GameRulesEngine {
    private GameRulesEngine() {}
    public static List<Role> shuffledRoles(GameRuleConfig config, RandomGenerator random) {
        List<Role> roles = new ArrayList<>(config.roles());
        for (int i = roles.size() - 1; i > 0; i--) Collections.swap(roles, i, random.nextInt(i + 1));
        return List.copyOf(roles);
    }
    public static boolean teamApproved(long approvals, int players) { return approvals > players / 2; }
    public static boolean missionFailed(long fails, GameRuleConfig config, int missionNo) { return fails >= config.failThreshold(missionNo); }
    public static int nextSeat(int seat, int players) { return seat == players ? 1 : seat + 1; }
    public static Winner missionWinner(int goodScore, int evilScore) {
        if (evilScore >= 3) return Winner.EVIL;
        return null; // Three good quests enter assassination rather than directly producing a winner.
    }
    public static Phase phaseAfterMission(int goodScore, int evilScore) {
        if (evilScore >= 3) return Phase.FINISHED;
        if (goodScore >= 3) return Phase.ASSASSINATION;
        return Phase.MISSION_RESULT;
    }
    public static Winner assassinationWinner(Role target) { return target == Role.MERLIN ? Winner.EVIL : Winner.GOOD; }
}
