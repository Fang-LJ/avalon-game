package com.avalon.game.common;

public final class TraceContext {
    private static final ThreadLocal<String> VALUE = new ThreadLocal<>();
    private TraceContext() {}
    public static void set(String traceId) { VALUE.set(traceId); }
    public static String get() { return VALUE.get(); }
    public static void clear() { VALUE.remove(); }
}
