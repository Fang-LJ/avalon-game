package com.avalon.game.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ProductionDeploymentContractTest {
    @Test void productionComposeExplicitlyPinsTheProdProfile() throws Exception {
        String compose = Files.readString(Path.of("../deploy/docker-compose.prod.yml"));
        assertTrue(compose.contains("SPRING_PROFILES_ACTIVE: prod"));
    }

    @Test void productionConfigurationHasNoLegacyMockLoginSwitch() throws Exception {
        String application = Files.readString(Path.of("src/main/resources/application.yml"));
        String example = Files.readString(Path.of("../deploy/.env.prod.example"));
        assertFalse(application.contains("AVALON_MOCK_LOGIN_ENABLED"));
        assertFalse(application.contains("mock-login-enabled"));
        assertFalse(example.contains("AVALON_MOCK_LOGIN_ENABLED"));
    }
}
