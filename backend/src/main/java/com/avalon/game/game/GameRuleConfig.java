package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.Role;

import java.util.List;
import java.util.Map;

/** Standard Avalon: only quest 4 needs two fails in games with 7+ players. */
public record GameRuleConfig(int playerCount, List<Role> roles, List<Integer> teamSizes, List<Integer> failThresholds,
                             int rejectedTeamsToEvilWin) {
    private static final Map<Integer, GameRuleConfig> CONFIGS = Map.of(
            6, new GameRuleConfig(6, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN),
                    List.of(2, 3, 4, 3, 4), List.of(1, 1, 1, 1, 1), 5),
            7, new GameRuleConfig(7, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.OBERON),
                    List.of(2, 3, 3, 4, 4), List.of(1, 1, 1, 2, 1), 5),
            8, new GameRuleConfig(8, List.of(Role.MERLIN, Role.PERCIVAL, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.LOYAL_SERVANT, Role.MORGANA, Role.ASSASSIN, Role.OBERON),
                    List.of(3, 4, 4, 5, 5), List.of(1, 1, 1, 2, 1), 5)
    );
    public static GameRuleConfig forPlayers(int count) {
        GameRuleConfig config = CONFIGS.get(count);
        if (config == null) throw new BusinessException("PARAM_ERROR", "首版仅支持 6、7、8 人");
        return config;
    }
    public int teamSize(int missionNo) { return teamSizes.get(missionNo - 1); }
    public int failThreshold(int missionNo) { return failThresholds.get(missionNo - 1); }
}
