package com.avalon.game.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

class ProductionConfigurationValidatorTest {
    @Test void productionFailsClosedWhenRequiredConfigurationIsMissing() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> new ProductionConfigurationValidator(new MockEnvironment()));
        assertTrue(error.getMessage().contains("AVALON_JWT_SECRET"));
        assertTrue(error.getMessage().contains("AVALON_DB_HOST"));
    }

    @Test void productionRejectsTheLocalJwtSecret() {
        MockEnvironment environment = completeEnvironment()
                .withProperty("AVALON_JWT_SECRET", ProductionConfigurationValidator.LOCAL_JWT_SECRET);
        assertThrows(IllegalStateException.class, () -> new ProductionConfigurationValidator(environment));
    }

    @Test void productionAcceptsExplicitNonLocalConfiguration() {
        assertDoesNotThrow(() -> new ProductionConfigurationValidator(completeEnvironment()));
    }

    private MockEnvironment completeEnvironment() {
        return new MockEnvironment()
                .withProperty("AVALON_DB_HOST", "db.internal")
                .withProperty("AVALON_DB_PORT", "3306")
                .withProperty("AVALON_DB_NAME", "avalon")
                .withProperty("AVALON_DB_USERNAME", "avalon")
                .withProperty("AVALON_DB_PASSWORD", "test-only-password")
                .withProperty("AVALON_JWT_SECRET", "test-only-production-secret-with-more-than-32-bytes")
                .withProperty("AVALON_WECHAT_APP_ID", "test-app-id")
                .withProperty("AVALON_WECHAT_APP_SECRET", "test-app-secret");
    }
}
