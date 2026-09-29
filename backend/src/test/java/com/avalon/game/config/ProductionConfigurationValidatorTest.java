package com.avalon.game.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ProductionConfigurationValidatorTest {
    private static final Map<String, String> COMPLETE = new LinkedHashMap<>();
    static {
        COMPLETE.put("AVALON_DB_HOST", "db.internal");
        COMPLETE.put("AVALON_DB_PORT", "3306");
        COMPLETE.put("AVALON_DB_NAME", "avalon");
        COMPLETE.put("AVALON_DB_USERNAME", "avalon");
        COMPLETE.put("AVALON_DB_PASSWORD", "test-only-password");
        COMPLETE.put("AVALON_JWT_SECRET", "test-only-production-secret-with-more-than-32-bytes");
        COMPLETE.put("AVALON_WECHAT_APP_ID", "test-app-id");
        COMPLETE.put("AVALON_WECHAT_APP_SECRET", "test-app-secret");
        COMPLETE.put("AVALON_MINIO_ENDPOINT", "http://minio:9000");
        COMPLETE.put("AVALON_MINIO_ACCESS_KEY", "test-access-key");
        COMPLETE.put("AVALON_MINIO_SECRET_KEY", "test-secret-key");
        COMPLETE.put("AVALON_MINIO_BUCKET", "playmate-files");
        COMPLETE.put("AVALON_MINIO_PUBLIC_BASE_URL", "https://api.invalid/minio");
    }

    @ParameterizedTest
    @ValueSource(strings = {"AVALON_DB_HOST", "AVALON_DB_PORT", "AVALON_DB_NAME", "AVALON_DB_USERNAME",
            "AVALON_DB_PASSWORD", "AVALON_JWT_SECRET", "AVALON_WECHAT_APP_ID", "AVALON_WECHAT_APP_SECRET",
            "AVALON_MINIO_ENDPOINT", "AVALON_MINIO_ACCESS_KEY", "AVALON_MINIO_SECRET_KEY", "AVALON_MINIO_BUCKET",
            "AVALON_MINIO_PUBLIC_BASE_URL"})
    void productionFailsClosedWhenAnyRequiredConfigurationIsMissing(String missingName) {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> new ProductionConfigurationValidator(environmentWithout(missingName)));
        assertTrue(error.getMessage().contains(missingName));
    }

    @Test void productionRejectsTheLocalJwtSecret() {
        MockEnvironment environment = completeEnvironment();
        environment.setProperty("AVALON_JWT_SECRET", ProductionConfigurationValidator.LOCAL_JWT_SECRET);
        assertThrows(IllegalStateException.class, () -> new ProductionConfigurationValidator(environment));
    }

    @Test void productionAcceptsExplicitCompleteConfiguration() {
        assertDoesNotThrow(() -> new ProductionConfigurationValidator(completeEnvironment()));
    }

    private MockEnvironment completeEnvironment() { return environmentWithout(null); }
    private MockEnvironment environmentWithout(String excluded) {
        MockEnvironment environment = new MockEnvironment();
        COMPLETE.forEach((name, value) -> { if (!name.equals(excluded)) environment.setProperty(name, value); });
        return environment;
    }
}
