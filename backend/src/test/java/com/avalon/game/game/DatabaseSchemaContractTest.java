package com.avalon.game.game;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseSchemaContractTest {
    @Test void allTablesAreNamespacedAndDuplicateSecretActionsArePrevented() throws Exception {
        String sql = Files.readString(Path.of("../docs/sql/001_avalon_init.sql"));
        assertEquals(9, sql.split("CREATE TABLE IF NOT EXISTS t_avalon_", -1).length - 1);
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_vote_once (mission_id, player_id)"));
        assertTrue(sql.contains("UNIQUE KEY uk_avalon_mission_action_once (mission_id, player_id)"));
        assertFalse(sql.matches("(?s).*CREATE TABLE IF NOT EXISTS (?!t_avalon_).*"));
    }
}
