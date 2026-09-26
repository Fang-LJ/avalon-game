package com.avalon.game.game;

public final class GameTypes {
    private GameTypes() {}
    public enum Alignment { GOOD, EVIL }
    public enum Role {
        MERLIN(Alignment.GOOD, "梅林"), PERCIVAL(Alignment.GOOD, "派西维尔"), LOYAL_SERVANT(Alignment.GOOD, "忠臣"),
        MORGANA(Alignment.EVIL, "莫甘娜"), ASSASSIN(Alignment.EVIL, "刺客"), OBERON(Alignment.EVIL, "奥伯伦");
        private final Alignment alignment; private final String label;
        Role(Alignment alignment, String label) { this.alignment = alignment; this.label = label; }
        public Alignment alignment() { return alignment; }
        public String label() { return label; }
    }
    public enum Phase { ROLE_CONFIRM, TEAM_BUILDING, TEAM_VOTING, MISSION_EXECUTING, MISSION_RESULT, ASSASSINATION, FINISHED }
    public enum Winner { GOOD, EVIL }
    public enum VoteChoice { APPROVE, REJECT }
    public enum MissionChoice { SUCCESS, FAIL }
}
