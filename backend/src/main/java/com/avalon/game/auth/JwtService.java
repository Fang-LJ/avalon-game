package com.avalon.game.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Date;

@Component
public class JwtService {
    private final JwtProperties properties;
    private final SecretKey key;
    public JwtService(JwtProperties properties) {
        this.properties = properties;
        try { this.key = Keys.hmacShaKeyFor(MessageDigest.getInstance("SHA-256").digest(properties.getSecret().getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    public String create(Long userId) {
        Instant now = Instant.now();
        return Jwts.builder().subject(userId.toString()).claim("userId", userId).issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(properties.getExpireSeconds()))).signWith(key).compact();
    }
    public Long parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        Object id = claims.get("userId");
        return id instanceof Number number ? number.longValue() : Long.valueOf(claims.getSubject());
    }
}
