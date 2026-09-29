package com.avalon.game.me;

import com.avalon.game.common.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class AvatarService {
    static final long MAX_FILE_SIZE = 5L * 1024 * 1024;
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", "jpg", "image/png", "png", "image/webp", "webp"
    );
    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private final AvatarStorageService storage;

    public AvatarService(AvatarStorageService storage) { this.storage = storage; }

    public AvatarUploadResult upload(long userId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw param("请选择头像图片");
        if (file.getSize() > MAX_FILE_SIZE) throw param("头像大小不能超过 5MB");
        String contentType = file.getContentType() == null ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        String extension = EXTENSIONS.get(contentType);
        if (extension == null) throw param("只支持 jpg、png、webp 图片");
        String objectKey = "avalon/avatars/" + LocalDate.now().format(DATE) + "/" + userId + "/"
                + UUID.randomUUID() + "." + extension;
        try {
            return new AvatarUploadResult(storage.upload(objectKey, contentType, file.getSize(), file.getInputStream()));
        } catch (IOException exception) {
            throw new BusinessException("UPLOAD_FAILED", "头像上传失败，请重试");
        }
    }

    private BusinessException param(String message) { return new BusinessException("PARAM_ERROR", message); }
    public record AvatarUploadResult(String url) {}
}
