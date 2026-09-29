package com.avalon.game.me;

import com.avalon.game.auth.LoginUserContext;
import com.avalon.game.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/avalon/me")
public class MeController {
    private final MeService service;
    private final AvatarService avatarService;
    public MeController(MeService service, AvatarService avatarService) {
        this.service = service; this.avatarService = avatarService;
    }
    @GetMapping("/profile") public ApiResponse<MeService.Profile> profile() {
        return ApiResponse.success(service.profile(LoginUserContext.require()));
    }
    @PutMapping("/profile") public ApiResponse<MeService.Profile> update(@RequestBody MeService.ProfileUpdateRequest request) {
        return ApiResponse.success(service.updateProfile(LoginUserContext.require(), request));
    }
    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    public ApiResponse<AvatarService.AvatarUploadResult> avatar(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return ApiResponse.success(avatarService.upload(LoginUserContext.require(), file));
    }
    @GetMapping("/games") public ApiResponse<MeService.GamesPage> games(
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String alignment) {
        return ApiResponse.success(service.games(LoginUserContext.require(), page, size, alignment));
    }
    @GetMapping("/stats") public ApiResponse<MeService.Stats> stats() {
        return ApiResponse.success(service.stats(LoginUserContext.require()));
    }
}
