package com.avalon.game.game;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.GameTypes.*;

import java.util.Collection;
import java.util.Set;

public final class GameActionPolicy {
    private GameActionPolicy() {}
    public static void requirePhase(Phase actual, Phase expected) {
        if (actual != expected) throw new BusinessException("INVALID_PHASE", "当前游戏阶段不能执行此操作");
    }
    public static void requireLeader(long actorPlayerId, long leaderPlayerId) {
        if (actorPlayerId != leaderPlayerId) throw new BusinessException("FORBIDDEN", "只有当前队长可以提交队伍");
    }
    public static void requireTeamSize(Collection<Long> team, int expected) {
        if (team == null || team.size() != expected || team.stream().distinct().count() != expected)
            throw new BusinessException("PARAM_ERROR", "任务队伍人数不正确");
    }
    public static void requireMissionMember(long actorPlayerId, Collection<Long> team) {
        if (!team.contains(actorPlayerId)) throw new BusinessException("FORBIDDEN", "你不在本轮任务队伍中");
    }
    public static void requireMissionChoice(Role role, MissionChoice choice) {
        if (role.alignment() == Alignment.GOOD && choice == MissionChoice.FAIL)
            throw new BusinessException("FORBIDDEN", "正义阵营只能选择任务成功");
    }
    public static void requireLadyHolder(long actorPlayerId, Long holderPlayerId) {
        if (holderPlayerId == null || actorPlayerId != holderPlayerId)
            throw new BusinessException("FORBIDDEN", "只有当前湖中仙女持有者可以检查阵营");
    }
    public static void requireLadyTarget(long actorPlayerId, long targetPlayerId, Collection<Long> gamePlayerIds,
                                         Set<Long> previousHolderIds) {
        if (actorPlayerId == targetPlayerId) throw new BusinessException("PARAM_ERROR", "湖中仙女不能检查自己");
        if (!gamePlayerIds.contains(targetPlayerId)) throw new BusinessException("PARAM_ERROR", "目标玩家不在当前游戏");
        if (previousHolderIds.contains(targetPlayerId)) throw new BusinessException("PARAM_ERROR", "不能检查曾经持有湖中仙女的玩家");
    }
    public static void requireRestartPlayerCount(int activePlayers, int requiredPlayers) {
        if (activePlayers != requiredPlayers) throw new BusinessException("人数不足，无法开始下一局");
    }
}
