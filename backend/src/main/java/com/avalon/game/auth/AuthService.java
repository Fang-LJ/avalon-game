package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import com.avalon.game.game.AvalonRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

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
        long userId;
        if (existing.isEmpty()) {
            String nickname = request != null && StringUtils.hasText(request.nickname()) ? request.nickname().trim() : "微信玩家";
            userId = repository.insertUser(identity.provider(), identity.providerUserId(), nickname);
        } else userId = existing.get().id();
        String nickname = repository.nickname(userId);
        return new LoginResult(jwtService.create(userId), userId, nickname);
    }
    public record LoginRequest(String code, String mockOpenid, String nickname) {}
    public record LoginResult(String token, Long userId, String nickname) {}
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
    private final WechatProperties properties;
    private final RestClient client = RestClient.create("https://api.weixin.qq.com");
    ProductionWechatIdentityResolver(WechatProperties properties) { this.properties = properties; }
    @SuppressWarnings("unchecked")
    public ResolvedIdentity resolve(String code, String mockOpenid) {
        if (mockOpenid != null) throw new BusinessException("FORBIDDEN", "生产环境禁止模拟登录");
        if (!StringUtils.hasText(code)) throw new BusinessException("PARAM_ERROR", "微信登录 code 不能为空");
        if (!StringUtils.hasText(properties.getAppId()) || !StringUtils.hasText(properties.getAppSecret())) throw new BusinessException("微信登录未配置");
        Map<String,Object> body;
        try {
            body = client.get().uri(builder -> builder.path("/sns/jscode2session")
                    .queryParam("appid", properties.getAppId()).queryParam("secret", properties.getAppSecret())
                    .queryParam("js_code", code.trim()).queryParam("grant_type", "authorization_code").build()).retrieve().body(Map.class);
        } catch (RuntimeException e) { throw new BusinessException("微信登录服务暂不可用"); }
        if (body == null || body.get("openid") == null) throw new BusinessException("微信登录失败");
        return new ResolvedIdentity("WECHAT", String.valueOf(body.get("openid")));
    }
}
