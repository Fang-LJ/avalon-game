package com.avalon.game.config;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

@Component
@Profile("prod")
public class ProductionConfigurationValidator {
    static final String LOCAL_JWT_SECRET = "avalon-local-dev-jwt-secret-change-me-at-least-32-bytes";
    private static final List<String> REQUIRED = List.of(
            "AVALON_DB_HOST", "AVALON_DB_PORT", "AVALON_DB_NAME", "AVALON_DB_USERNAME", "AVALON_DB_PASSWORD",
            "AVALON_JWT_SECRET", "AVALON_WECHAT_APP_ID", "AVALON_WECHAT_APP_SECRET",
            "AVALON_MINIO_ENDPOINT", "AVALON_MINIO_ACCESS_KEY", "AVALON_MINIO_SECRET_KEY",
            "AVALON_MINIO_BUCKET", "AVALON_MINIO_PUBLIC_BASE_URL"
    );
    private final Environment environment;

    public ProductionConfigurationValidator(Environment environment) {
        this.environment = environment;
        validate();
    }

    void validate() {
        List<String> missing = REQUIRED.stream().filter(name -> !StringUtils.hasText(environment.getProperty(name))).toList();
        if (!missing.isEmpty()) throw new IllegalStateException("Missing required production configuration: " + String.join(", ", missing));
        if (LOCAL_JWT_SECRET.equals(environment.getProperty("AVALON_JWT_SECRET")))
            throw new IllegalStateException("Production must not use the local JWT secret");
    }
}
