package com.avalon.game.game;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseSchemaContractTest {
    private static final Set<String> V2_TABLES = Set.of(
            "t_avalon_user", "t_avalon_game", "t_avalon_game_player", "t_avalon_proposal",
            "t_avalon_vote", "t_avalon_mission", "t_avalon_mission_action", "t_avalon_lady_action");

    @Test void freshSchemaCreatesExactlyTheEightV2Tables() throws Exception {
        String sql = Files.readString(Path.of("../docs/sql/001_avalon_init.sql"));
        assertEquals(V2_TABLES, createdTables(sql));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_vote_once (proposal_id, game_player_id)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_mission_round (game_id, mission_no)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_mission_action_once (mission_id, game_player_id)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_lady_sequence (game_id, sequence_no)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_lady_holder (game_id, holder_game_player_id)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_lady_target (game_id, target_game_player_id)"));
        assertTrue(sql.contains("team_player_ids JSON NOT NULL"));
        assertTrue(sql.contains("assassination_target_game_player_id BIGINT NULL"));
        assertTrue(sql.contains("seat_no TINYINT NULL"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_game_seat (game_id, seat_no)"));
        assertFalse(sql.contains("CREATE TABLE IF NOT EXISTS t_avalon_room"));
        assertFalse(sql.contains("CREATE TABLE IF NOT EXISTS t_avalon_player"));
        assertFalse(sql.contains("CREATE TABLE IF NOT EXISTS t_avalon_user_identity"));
        assertFalse(sql.matches("(?s).*CREATE TABLE IF NOT EXISTS (?!t_avalon_).*"));
    }

    @Test void seatMigrationIsNonDestructiveAndOnlyMakesSeatNullable() throws Exception {
        String sql=Files.readString(Path.of("../docs/sql/004_seat_system.sql"));
        assertTrue(sql.contains("MODIFY COLUMN seat_no TINYINT NULL"));
        assertFalse(sql.toUpperCase().contains("DROP TABLE"));
        assertFalse(sql.toUpperCase().contains("DELETE FROM"));
        assertFalse(sql.toUpperCase().contains("TRUNCATE"));
    }

    @Test void destructiveV2MigrationDropsLegacyTablesAndRecreatesExactlyV2() throws Exception {
        String sql = Files.readString(Path.of("../docs/sql/003_avalon_v2_schema.sql"));
        assertEquals(V2_TABLES, createdTables(sql));
        assertTrue(sql.contains("DROP TABLE IF EXISTS t_avalon_user_identity"));
        assertTrue(sql.contains("DROP TABLE IF EXISTS t_avalon_room"));
        assertTrue(sql.contains("DROP TABLE IF EXISTS t_avalon_player"));
        assertTrue(sql.contains("SET FOREIGN_KEY_CHECKS = 0"));
        assertTrue(sql.contains("SET FOREIGN_KEY_CHECKS = 1"));
    }

    private Set<String> createdTables(String sql) {
        Matcher matcher = Pattern.compile("CREATE TABLE IF NOT EXISTS (t_avalon_[a-z_]+)").matcher(sql);
        java.util.HashSet<String> tables = new java.util.HashSet<>();
        while (matcher.find()) tables.add(matcher.group(1));
        return Set.copyOf(tables);
    }
    @Test void continueEndpointAndClientActionHaveBeenRemoved() throws Exception {
        String controller = Files.readString(Path.of("src/main/java/com/avalon/game/game/GameController.java"));
        String client = Files.readString(Path.of("../miniprogram/services/avalon.js"));
        assertFalse(controller.contains("/{gameId}/continue"));
        assertFalse(client.contains("continueRound"));
    }

    @Test void restartArchivingExcludesOldPlayersFromActiveLookupButKeepsHistoricalReads() throws Exception {
        String repository = Files.readString(Path.of("src/main/java/com/avalon/game/game/AvalonRepository.java"));
        assertTrue(repository.contains("left_at=coalesce(left_at,now())"));
        assertTrue(repository.contains("gp.left_at is null and g.status in ('WAITING','PLAYING','FINISHED')"));
        assertTrue(repository.contains("select * from t_avalon_game_player where game_id=? order by seat_no"));
        assertTrue(repository.contains("(Integer) rs.getObject(\"seat_no\")"));
    }
}
