package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

import static org.junit.jupiter.api.Assertions.*;

class WechatIdentityResolverProfileTest {
    @Test void localProfileKeepsAllTenMockUsersAvailable() {
        MockWechatIdentityResolver resolver = new MockWechatIdentityResolver();
        for (int i = 1; i <= 10; i++)
            assertEquals("avalon_mock_" + i, resolver.resolve(null, "avalon_mock_" + i));
        assertArrayEquals(new String[]{"local"}, MockWechatIdentityResolver.class.getAnnotation(Profile.class).value());
    }

    @Test void productionAlwaysRejectsMockOpenid() {
        ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(configuredWechat());
        BusinessException error = assertThrows(BusinessException.class,
                () -> resolver.resolve("a-real-code-must-not-override-mock-input", "avalon_mock_1"));
        assertEquals("FORBIDDEN", error.getCode());
        assertEquals("FORBIDDEN", assertThrows(BusinessException.class,
                () -> resolver.resolve("a-real-code", "")).getCode());
        assertArrayEquals(new String[]{"prod"}, ProductionWechatIdentityResolver.class.getAnnotation(Profile.class).value());
    }

    @Test void legacyMockEnabledFlagCannotReEnableProductionMockLogin() {
        System.setProperty("AVALON_MOCK_LOGIN_ENABLED", "true");
        try {
            ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(configuredWechat());
            BusinessException error = assertThrows(BusinessException.class,
                    () -> resolver.resolve(null, "avalon_mock_10"));
            assertEquals("FORBIDDEN", error.getCode());
            assertThrows(NoSuchMethodException.class,
                    () -> WechatProperties.class.getMethod("setMockLoginEnabled", boolean.class));
        } finally {
            System.clearProperty("AVALON_MOCK_LOGIN_ENABLED");
        }
    }

    private WechatProperties configuredWechat() {
        WechatProperties properties = new WechatProperties();
        properties.setAppId("test-app-id");
        properties.setAppSecret("test-app-secret");
        return properties;
    }
}
