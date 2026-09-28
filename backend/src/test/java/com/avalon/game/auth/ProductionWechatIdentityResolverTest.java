package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ProductionWechatIdentityResolverTest {
    @Test void readsOpenidFromTextPlainJson() {
        Fixture fixture = fixture(MediaType.TEXT_PLAIN, "{\"openid\":\"wx-openid-text\",\"session_key\":\"must-not-leak\"}");

        ResolvedIdentity identity = fixture.resolver.resolve("fresh-code", null);

        assertEquals("WECHAT", identity.provider());
        assertEquals("wx-openid-text", identity.providerUserId());
        fixture.server.verify();
    }

    @Test void readsEquivalentApplicationJsonResponse() {
        Fixture fixture = fixture(MediaType.APPLICATION_JSON, "{\"openid\":\"wx-openid-json\"}");

        ResolvedIdentity identity = fixture.resolver.resolve("fresh-code", null);

        assertEquals("wx-openid-json", identity.providerUserId());
        fixture.server.verify();
    }

    @Test void rejectsWechatBusinessErrorWithoutCreatingAnIdentity() {
        Fixture fixture = fixture(MediaType.TEXT_PLAIN, "{\"errcode\":40029,\"errmsg\":\"invalid code\"}");

        BusinessException error = assertThrows(BusinessException.class,
                () -> fixture.resolver.resolve("invalid-code", null));

        assertEquals("WECHAT_LOGIN_FAILED", error.getCode());
        assertEquals("微信登录失败，请重新授权后重试", error.getMessage());
        fixture.server.verify();
    }

    @Test void rejectsResponseWithoutOpenid() {
        Fixture fixture = fixture(MediaType.APPLICATION_JSON, "{\"session_key\":\"must-not-leak\"}");

        BusinessException error = assertThrows(BusinessException.class,
                () -> fixture.resolver.resolve("fresh-code", null));

        assertEquals("WECHAT_LOGIN_FAILED", error.getCode());
        fixture.server.verify();
    }

    @Test void malformedResponseFailsSafely() {
        Fixture fixture = fixture(MediaType.TEXT_PLAIN, "not-json session_key=must-not-leak");

        BusinessException error = assertThrows(BusinessException.class,
                () -> fixture.resolver.resolve("fresh-code", null));

        assertEquals("WECHAT_LOGIN_FAILED", error.getCode());
        assertEquals("微信登录失败，请重新授权后重试", error.getMessage());
        fixture.server.verify();
    }

    @Test void transportFailureHasDistinctSafeMessage() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/sns/jscode2session")))
                .andRespond(withServerError());
        ProductionWechatIdentityResolver resolver = new ProductionWechatIdentityResolver(
                configuredWechat(), new ObjectMapper(), builder);

        BusinessException error = assertThrows(BusinessException.class,
                () -> resolver.resolve("fresh-code", null));

        assertEquals("WECHAT_UNAVAILABLE", error.getCode());
        assertEquals("微信服务暂时不可用，请稍后重试", error.getMessage());
        server.verify();
    }

    private Fixture fixture(MediaType contentType, String response) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/sns/jscode2session")))
                .andExpect(queryParam("appid", "test-app-id"))
                .andExpect(queryParam("secret", "test-app-secret"))
                .andExpect(queryParam("grant_type", "authorization_code"))
                .andRespond(withSuccess(response, contentType));
        return new Fixture(new ProductionWechatIdentityResolver(configuredWechat(), new ObjectMapper(), builder), server);
    }

    private WechatProperties configuredWechat() {
        WechatProperties properties = new WechatProperties();
        properties.setAppId("test-app-id");
        properties.setAppSecret("test-app-secret");
        return properties;
    }

    private record Fixture(ProductionWechatIdentityResolver resolver, MockRestServiceServer server) {}
}
