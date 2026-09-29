package com.avalon.game.me;

import java.io.InputStream;

public interface AvatarStorageService {
    String upload(String objectKey, String contentType, long size, InputStream inputStream);
}
