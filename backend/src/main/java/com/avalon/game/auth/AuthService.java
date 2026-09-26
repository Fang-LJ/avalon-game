package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final JwtService jwtService;
    private final WechatIdentityResolver resolver;
    public AuthService(JdbcTemplate jdbc, JwtService jwtService, WechatIdentityResolver resolver) {
        this.jdbc = jdbc; this.jwtService = jwtService; this.resolver = resolver;
    }
    @Transactional
    public LoginResult login(LoginRequest request) {
        String openid = resolver.resolve(request == null ? null : request.code(), request == null ? null : request.mockOpenid());
        List<Long> ids = jdbc.query("select user_id from t_avalon_user_identity where provider='WECHAT' and provider_user_id=?",
                (rs, n) -> rs.getLong(1), openid);
        long userId;
        if (ids.isEmpty()) {
            String nickname = request != null && StringUtils.hasText(request.nickname()) ? request.nickname().trim() : "微信玩家";
            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement ps = connection.prepareStatement("insert into t_avalon_user(nickname, created_at, updated_at) values (?,now(),now())", Statement.RETURN_GENERATED_KEYS);
                ps.setString(1, nickname); return ps;
            }, key);
            userId = key.getKey().longValue();
            jdbc.update("insert into t_avalon_user_identity(user_id,provider,provider_user_id,created_at) values (?,'WECHAT',?,now())", userId, openid);
        } else { userId = ids.getFirst(); }
        String nickname = jdbc.queryForObject("select nickname from t_avalon_user where id=?", String.class, userId);
        return new LoginResult(jwtService.create(userId), userId, nickname);
    }
    public record LoginRequest(String code, String mockOpenid, String nickname) {}
    public record LoginResult(String token, Long userId, String nickname) {}
}

interface WechatIdentityResolver { String resolve(String code, String mockOpenid); }

@Service
@Profile("local")
class MockWechatIdentityResolver implements WechatIdentityResolver {
    public String resolve(String code, String mockOpenid) {
        String value = StringUtils.hasText(mockOpenid) ? mockOpenid.trim() : StringUtils.hasText(code) ? "mock_" + code.trim() : null;
        if (!StringUtils.hasText(value)) throw new BusinessException("PARAM_ERROR", "mockOpenid 或 code 不能为空");
        if (value.length() > 128) throw new BusinessException("PARAM_ERROR", "用户标识过长");
        return value;
    }
}

@Service
@Profile("prod")
class ProductionWechatIdentityResolver implements WechatIdentityResolver {
    private final WechatProperties properties;
    private final RestClient client = RestClient.create("https://api.weixin.qq.com");
    ProductionWechatIdentityResolver(WechatProperties properties) { this.properties = properties; }
    @SuppressWarnings("unchecked")
    public String resolve(String code, String mockOpenid) {
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
        return String.valueOf(body.get("openid"));
    }
}
