package com.avalon.game.bot;

import com.avalon.game.game.GameTypes.*;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.random.RandomGenerator;

/** Deliberately naive: no inference from other players' secret identities. */
@Component
public class BotStrategy {
    private final RandomGenerator random;

    public BotStrategy() { this(new SecureRandom()); }
    BotStrategy(RandomGenerator random) { this.random = random; }

    public VoteChoice vote() { return random.nextInt(100) < 70 ? VoteChoice.APPROVE : VoteChoice.REJECT; }
    public MissionChoice mission(Alignment ownAlignment) {
        return ownAlignment == Alignment.EVIL && random.nextInt(100) < 70 ? MissionChoice.FAIL : MissionChoice.SUCCESS;
    }
    public List<Long> team(long self, List<Long> players, int size) {
        if (!players.contains(self) || size < 1 || size > players.stream().distinct().count())
            throw new IllegalArgumentException("Invalid bot team size");
        List<Long> candidates = new ArrayList<>(players.stream().distinct().filter(id -> id != self).toList());
        List<Long> team = new ArrayList<>();
        team.add(self);
        while (team.size() < size) team.add(candidates.remove(random.nextInt(candidates.size())));
        return List.copyOf(team);
    }
    public long target(List<Long> candidates) {
        if (candidates.isEmpty()) throw new IllegalArgumentException("No legal bot target");
        return candidates.get(random.nextInt(candidates.size()));
    }
}
