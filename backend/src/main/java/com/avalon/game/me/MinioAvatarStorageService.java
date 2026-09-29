package com.avalon.game.me;

import com.avalon.game.common.BusinessException;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.stereotype.Service;

import java.io.InputStream;

@Service
public class MinioAvatarStorageService implements AvatarStorageService {
    private final MinioProperties properties;
    private final MinioClient client;

    public MinioAvatarStorageService(MinioProperties properties) {
        this.properties = properties;
        this.client = MinioClient.builder()
                .endpoint(properties.getEndpoint())
                .credentials(properties.getAccessKey(), properties.getSecretKey())
                .build();
    }

    @Override
    public String upload(String objectKey, String contentType, long size, InputStream inputStream) {
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(properties.getBucket())
                    .object(objectKey)
                    .stream(inputStream, size, -1)
                    .contentType(contentType)
                    .build());
            String base = withoutTrailingSlash(properties.getPublicBaseUrl());
            return base + "/" + properties.getBucket() + "/" + objectKey;
        } catch (Exception exception) {
            throw new BusinessException("UPLOAD_FAILED", "头像上传失败，请重试");
        }
    }

    private String withoutTrailingSlash(String value) {
        if (value == null || value.isBlank()) throw new BusinessException("UPLOAD_FAILED", "头像存储未配置");
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
