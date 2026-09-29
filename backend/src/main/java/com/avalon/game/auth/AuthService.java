package com.avalon.game.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@Service
public class AuthService {
    private final AvalonRepository repository;
    private final JwtService jwtService;
    private final WechatIdentityResolver resolver;
    public AuthService(AvalonRepository repository, JwtService jwtService, WechatIdentityResolver resolver) {
        this.repository = repository; this.jwtService = jwtService; this.resolver = resolver;
    }
    @Transactional
    public LoginResult login(LoginRequest request) {
        ResolvedIdentity identity = resolver.resolve(request == null ? null : request.code(), request == null ? null : request.mockOpenid());
        var existing = repository.user(identity.provider(), identity.providerUserId());
        boolean isNewUser = existing.isEmpty();
        AvalonRepository.UserRow user;
        if (existing.isEmpty()) {
            String nickname = request != null && StringUtils.hasText(request.nickname()) ? request.nickname().trim() : "微信玩家";
            long userId = repository.insertUser(identity.provider(), identity.providerUserId(), nickname);
            user = new AvalonRepository.UserRow(userId, identity.provider(), identity.providerUserId(), nickname, null);
        } else user = existing.get();
        return new LoginResult(jwtService.create(user.id()), user.id(), user.nickname(), user.avatarUrl(), isNewUser,
                StringUtils.hasText(user.nickname()) && StringUtils.hasText(user.avatarUrl()));
    }
    public record LoginRequest(String code, String mockOpenid, String nickname) {}
    public record LoginResult(String token, Long userId, String nickname, String avatarUrl,
                              boolean isNewUser, boolean profileComplete) {}
}

interface WechatIdentityResolver { ResolvedIdentity resolve(String code, String mockOpenid); }
record ResolvedIdentity(String provider, String providerUserId) {}

@Service
@Profile("local")
class MockWechatIdentityResolver implements WechatIdentityResolver {
    public ResolvedIdentity resolve(String code, String mockOpenid) {
        String value = StringUtils.hasText(mockOpenid) ? mockOpenid.trim() : StringUtils.hasText(code) ? "mock_" + code.trim() : null;
        if (!StringUtils.hasText(value)) throw new BusinessException("PARAM_ERROR", "mockOpenid 或 code 不能为空");
        if (value.length() > 128) throw new BusinessException("PARAM_ERROR", "用户标识过长");
        return new ResolvedIdentity("LOCAL", value);
    }
}

@Service
@Profile("prod")
class ProductionWechatIdentityResolver implements WechatIdentityResolver {
    private static final Logger log = LoggerFactory.getLogger(ProductionWechatIdentityResolver.class);
    private static final String WECHAT_LOGIN_FAILED = "微信登录失败，请重新授权后重试";
    private static final String WECHAT_UNAVAILABLE = "微信服务暂时不可用，请稍后重试";
    private static final TypeReference<Map<String, Object>> WECHAT_RESPONSE = new TypeReference<>() {};
    private final WechatProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient client;

    @Autowired
    ProductionWechatIdentityResolver(WechatProperties properties, ObjectMapper objectMapper, RestClient.Builder builder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.client = builder.baseUrl("https://api.weixin.qq.com").build();
    }

    ProductionWechatIdentityResolver(WechatProperties properties) {
        this(properties, new ObjectMapper(), RestClient.builder());
    }

    public ResolvedIdentity resolve(String code, String mockOpenid) {
        if (mockOpenid != null) throw new BusinessException("FORBIDDEN", "生产环境禁止模拟登录");
        if (!StringUtils.hasText(code)) throw new BusinessException("PARAM_ERROR", "微信登录 code 不能为空");
        if (!StringUtils.hasText(properties.getAppId()) || !StringUtils.hasText(properties.getAppSecret())) throw new BusinessException("微信登录未配置");
        String response;
        try {
            response = client.get().uri(builder -> builder.path("/sns/jscode2session")
                    .queryParam("appid", properties.getAppId()).queryParam("secret", properties.getAppSecret())
                    .queryParam("js_code", code.trim()).queryParam("grant_type", "authorization_code").build())
                    .retrieve().body(String.class);
        } catch (RestClientException e) {
            log.warn("WeChat jscode2session request unavailable: {}", e.getClass().getSimpleName());
            throw new BusinessException("WECHAT_UNAVAILABLE", WECHAT_UNAVAILABLE);
        }

        Map<String, Object> body;
        try {
            body = objectMapper.readValue(response == null ? "" : response, WECHAT_RESPONSE);
        } catch (JsonProcessingException e) {
            log.warn("WeChat jscode2session returned malformed JSON");
            throw new BusinessException("WECHAT_LOGIN_FAILED", WECHAT_LOGIN_FAILED);
        }

        long errcode = number(body.get("errcode"));
        if (errcode != 0) {
            log.warn("WeChat jscode2session rejected login: errcode={}, errmsg={}", errcode, safeErrmsg(body.get("errmsg")));
            throw new BusinessException("WECHAT_LOGIN_FAILED", WECHAT_LOGIN_FAILED);
        }
        String openid = body.get("openid") instanceof String value ? value.trim() : "";
        if (!StringUtils.hasText(openid) || openid.length() > 128) {
            log.warn("WeChat jscode2session response did not contain a valid openid");
            throw new BusinessException("WECHAT_LOGIN_FAILED", WECHAT_LOGIN_FAILED);
        }
        return new ResolvedIdentity("WECHAT", openid);
    }

    private long number(Object value) {
        if (value == null) return 0;
        if (value instanceof Number number) return number.longValue();
        try { return Long.parseLong(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return -1; }
    }

    private String safeErrmsg(Object value) {
        if (value == null) return "";
        String message = String.valueOf(value).replaceAll("[\\r\\n\\t]", " ");
        return message.substring(0, Math.min(message.length(), 200));
    }
}
