package com.avalon.game.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "avalon.wechat")
public class WechatProperties {
    private String appId;
    private String appSecret;
    private boolean mockLoginEnabled;
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getAppSecret() { return appSecret; }
    public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
    public boolean isMockLoginEnabled() { return mockLoginEnabled; }
    public void setMockLoginEnabled(boolean mockLoginEnabled) { this.mockLoginEnabled = mockLoginEnabled; }
}
