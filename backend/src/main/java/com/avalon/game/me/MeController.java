package com.avalon.game.me;

import com.avalon.game.auth.LoginUserContext;
import com.avalon.game.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/avalon/me")
public class MeController {
    private final MeService service;
    public MeController(MeService service) { this.service = service; }
    @GetMapping("/profile") public ApiResponse<MeService.Profile> profile() {
        return ApiResponse.success(service.profile(LoginUserContext.require()));
    }
    @PutMapping("/profile") public ApiResponse<MeService.Profile> update(@RequestBody NicknameRequest request) {
        return ApiResponse.success(service.updateNickname(LoginUserContext.require(), request.nickname()));
    }
    @GetMapping("/games") public ApiResponse<MeService.GamesPage> games(
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String alignment) {
        return ApiResponse.success(service.games(LoginUserContext.require(), page, size, alignment));
    }
    @GetMapping("/stats") public ApiResponse<MeService.Stats> stats() {
        return ApiResponse.success(service.stats(LoginUserContext.require()));
    }
    public record NicknameRequest(String nickname) {}
}
