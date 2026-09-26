package com.avalon.game.common;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> business(BusinessException e) {
        HttpStatus status = "UNAUTHORIZED".equals(e.getCode()) ? HttpStatus.UNAUTHORIZED
                : "FORBIDDEN".equals(e.getCode()) ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(ApiResponse.fail(e.getCode(), e.getMessage()));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class})
    public ResponseEntity<ApiResponse<Void>> validation(Exception e) {
        String message = e instanceof MethodArgumentNotValidException manv && manv.getBindingResult().getFieldError() != null
                ? manv.getBindingResult().getFieldError().getDefaultMessage() : "请求参数不正确";
        return ResponseEntity.badRequest().body(ApiResponse.fail("PARAM_ERROR", message));
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> unknown(Exception e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.fail("INTERNAL_ERROR", "服务器开小差了，请稍后重试"));
    }
}
