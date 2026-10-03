package com.avalon.game.room;

import com.avalon.game.auth.LoginUserContext;
import com.avalon.game.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/avalon/room")
public class RoomController {
    private final RoomService service;
    public RoomController(RoomService service) { this.service = service; }
    @PostMapping("/create") public ApiResponse<RoomService.RoomView> create(@Valid @RequestBody RoomService.CreateRequest request) {
        return ApiResponse.success(service.create(LoginUserContext.require(), request.maxPlayers(), request.nickname()));
    }
    @PostMapping("/join") public ApiResponse<RoomService.RoomView> join(@Valid @RequestBody RoomService.JoinRequest request) {
        return ApiResponse.success(service.join(LoginUserContext.require(), request.roomCode(), request.nickname()));
    }
    @PostMapping("/{roomId}/leave") public ApiResponse<Void> leave(@PathVariable long roomId) {
        service.leave(LoginUserContext.require(), roomId); return ApiResponse.success(null);
    }
    @PostMapping("/{roomId}/seat") public ApiResponse<RoomService.RoomView> seat(
            @PathVariable long roomId, @RequestBody RoomService.SeatRequest request) {
        return ApiResponse.success(service.seat(LoginUserContext.require(), roomId, request.seatNo()));
    }
    @PostMapping("/{roomId}/stand") public ApiResponse<RoomService.RoomView> stand(@PathVariable long roomId) {
        return ApiResponse.success(service.stand(LoginUserContext.require(), roomId));
    }
    @GetMapping("/current") public ApiResponse<RoomService.RoomView> current() { return ApiResponse.success(service.current(LoginUserContext.require())); }
    @PostMapping("/{roomId}/bots") public ApiResponse<RoomService.RoomView> addBot(@PathVariable long roomId) {
        return ApiResponse.success(service.addBot(LoginUserContext.require(), roomId));
    }
    @DeleteMapping("/{roomId}/bots/{playerId}") public ApiResponse<RoomService.RoomView> removeBot(@PathVariable long roomId, @PathVariable long playerId) {
        return ApiResponse.success(service.removeBot(LoginUserContext.require(), roomId, playerId));
    }
    @GetMapping("/{roomId}") public ApiResponse<RoomService.RoomView> get(@PathVariable long roomId) { return ApiResponse.success(service.get(LoginUserContext.require(), roomId)); }
}
