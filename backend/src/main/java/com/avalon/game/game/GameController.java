package com.avalon.game.game;

import com.avalon.game.auth.LoginUserContext;
import com.avalon.game.common.ApiResponse;
import com.avalon.game.room.RoomService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/avalon/game")
public class GameController {
    private final GameService service;
    public GameController(GameService service) { this.service = service; }
    @PostMapping("/start") public ApiResponse<GameService.GameState> start(@RequestParam long roomId) { return ApiResponse.success(service.start(LoginUserContext.require(), roomId)); }
    @GetMapping("/{gameId}") public ApiResponse<GameService.GameState> state(@PathVariable long gameId) { return ApiResponse.success(service.state(LoginUserContext.require(), gameId)); }
    @GetMapping("/{gameId}/my-role") public ApiResponse<GameService.MyRoleView> role(@PathVariable long gameId) { return ApiResponse.success(service.myRole(LoginUserContext.require(), gameId)); }
    @PostMapping("/{gameId}/role-confirm") public ApiResponse<GameService.GameState> confirm(@PathVariable long gameId) { return ApiResponse.success(service.confirmRole(LoginUserContext.require(), gameId)); }
    @PostMapping("/{gameId}/team") public ApiResponse<GameService.GameState> team(@PathVariable long gameId, @RequestBody GameService.TeamRequest r) { return ApiResponse.success(service.submitTeam(LoginUserContext.require(), gameId, r.playerIds())); }
    @PostMapping("/{gameId}/vote") public ApiResponse<GameService.GameState> vote(@PathVariable long gameId, @RequestBody GameService.VoteRequest r) { return ApiResponse.success(service.vote(LoginUserContext.require(), gameId, r.choice())); }
    @PostMapping("/{gameId}/mission") public ApiResponse<GameService.GameState> mission(@PathVariable long gameId, @RequestBody GameService.MissionRequest r) { return ApiResponse.success(service.mission(LoginUserContext.require(), gameId, r.choice())); }
    @PostMapping("/{gameId}/lady-of-lake") public ApiResponse<GameService.LadyInspectionResult> lady(
            @PathVariable long gameId, @RequestBody GameService.LadyInspectionRequest r) {
        return ApiResponse.success(service.inspectWithLady(LoginUserContext.require(), gameId, r.targetPlayerId()));
    }
    @PostMapping("/{gameId}/assassination/start") public ApiResponse<GameService.GameState> startAssassination(@PathVariable long gameId) {
        return ApiResponse.success(service.startAssassination(LoginUserContext.require(), gameId));
    }
    @PostMapping("/{gameId}/assassinate") public ApiResponse<GameService.GameState> assassinate(@PathVariable long gameId, @RequestBody GameService.AssassinateRequest r) { return ApiResponse.success(service.assassinate(LoginUserContext.require(), gameId, r.targetPlayerId())); }
    @PostMapping("/{gameId}/assassination/target") public ApiResponse<GameService.GameState> selectAssassinationTarget(
            @PathVariable long gameId, @RequestBody GameService.AssassinateRequest r) {
        return ApiResponse.success(service.selectAssassinationTarget(LoginUserContext.require(), gameId, r.targetPlayerId()));
    }
    @PostMapping("/{gameId}/restart") public ApiResponse<RoomService.RoomView> restart(@PathVariable long gameId) { return ApiResponse.success(service.restart(LoginUserContext.require(), gameId)); }
    @PostMapping("/{gameId}/end") public ApiResponse<GameService.EndResult> end(@PathVariable long gameId) {
        return ApiResponse.success(service.end(LoginUserContext.require(), gameId));
    }
}
