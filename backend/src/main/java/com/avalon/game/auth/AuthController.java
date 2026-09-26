package com.avalon.game.auth;

import com.avalon.game.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service;
    public AuthController(AuthService service) { this.service = service; }
    @PostMapping("/wx-login") public ApiResponse<AuthService.LoginResult> login(@RequestBody(required = false) AuthService.LoginRequest request) {
        return ApiResponse.success(service.login(request));
    }
}
