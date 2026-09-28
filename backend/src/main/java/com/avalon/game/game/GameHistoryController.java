package com.avalon.game.game;

import com.avalon.game.auth.LoginUserContext;
import com.avalon.game.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/avalon/game")
public class GameHistoryController {
    private final GameHistoryService service;
    public GameHistoryController(GameHistoryService service) { this.service = service; }
    @GetMapping("/{gameId}/timeline")
    public ApiResponse<GameHistoryService.Timeline> timeline(@PathVariable long gameId) {
        return ApiResponse.success(service.timeline(LoginUserContext.require(), gameId));
    }
    @GetMapping("/{gameId}/replay")
    public ApiResponse<GameHistoryService.Replay> replay(@PathVariable long gameId) {
        return ApiResponse.success(service.replay(LoginUserContext.require(), gameId));
    }
}
