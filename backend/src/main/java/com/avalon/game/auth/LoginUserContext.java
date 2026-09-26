package com.avalon.game.auth;

public final class LoginUserContext {
    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();
    private LoginUserContext() {}
    public static void set(Long value) { USER_ID.set(value); }
    public static Long require() {
        Long value = USER_ID.get();
        if (value == null) throw new com.avalon.game.common.BusinessException("UNAUTHORIZED", "请先登录");
        return value;
    }
    public static void clear() { USER_ID.remove(); }
}
