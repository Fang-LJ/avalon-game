package com.avalon.game.auth;

import com.avalon.game.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    private final JwtService jwtService;
    public AuthInterceptor(JwtService jwtService) { this.jwtService = jwtService; }
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) throw new BusinessException("UNAUTHORIZED", "请先登录");
        try { LoginUserContext.set(jwtService.parse(header.substring(7).trim())); return true; }
        catch (RuntimeException e) { throw new BusinessException("UNAUTHORIZED", "登录已失效，请重新登录"); }
    }
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        LoginUserContext.clear();
    }
}
