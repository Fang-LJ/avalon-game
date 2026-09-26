package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProductionWechatIdentityResolverTest {
    @Test
    void enabledMockLoginAllowsExactlyEightKnownUsers() {
        WechatProperties properties = new WechatProperties();
        properties.setMockLoginEnabled(true);
        ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(properties);

        for (int i = 1; i <= 8; i++) {
            assertEquals("avalon_mock_" + i, resolver.resolve(null, "avalon_mock_" + i));
        }
    }

    @Test
    void enabledMockLoginRejectsUnknownIdentity() {
        WechatProperties properties = new WechatProperties();
        properties.setMockLoginEnabled(true);
        ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(properties);

        BusinessException error = assertThrows(BusinessException.class,
                () -> resolver.resolve(null, "avalon_mock_9"));
        assertEquals("PARAM_ERROR", error.getCode());
    }

    @Test
    void productionMockLoginMustBeExplicitlyEnabled() {
        WechatProperties properties = new WechatProperties();
        ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(properties);

        BusinessException error = assertThrows(BusinessException.class,
                () -> resolver.resolve(null, "avalon_mock_1"));
        assertEquals("FORBIDDEN", error.getCode());
    }
}
