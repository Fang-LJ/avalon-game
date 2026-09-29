package com.avalon.game.config;

import com.avalon.game.auth.AuthInterceptor;
import com.avalon.game.auth.JwtProperties;
import com.avalon.game.auth.WechatProperties;
import com.avalon.game.me.MinioProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, WechatProperties.class, MinioProperties.class})
public class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;
    public WebConfig(AuthInterceptor authInterceptor) { this.authInterceptor = authInterceptor; }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**")
                .excludePathPatterns("/api/health", "/api/auth/wx-login");
    }
}
