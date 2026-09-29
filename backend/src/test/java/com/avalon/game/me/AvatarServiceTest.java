package com.avalon.game.me;

import com.avalon.game.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AvatarServiceTest {
    AvatarStorageService storage;
    AvatarService service;

    @BeforeEach void setup() {
        storage=mock(AvatarStorageService.class);service=new AvatarService(storage);
        when(storage.upload(anyString(),anyString(),anyLong(),any())).thenReturn("https://files.invalid/avatar.png");
    }

    @Test void imageUploadUsesAvalonUserPrefixAndReturnsPermanentUrl() {
        var result=service.upload(101,new MockMultipartFile("file","avatar.png","image/png",new byte[]{1,2,3}));
        assertEquals("https://files.invalid/avatar.png",result.url());
        verify(storage).upload(matches("avalon/avatars/\\d{8}/101/[0-9a-f-]+\\.png"),eq("image/png"),eq(3L),any());
    }

    @Test void nonImageIsRejected() {
        assertThrows(BusinessException.class,()->service.upload(101,
                new MockMultipartFile("file","avatar.txt","text/plain",new byte[]{1})));
        verifyNoInteractions(storage);
    }

    @Test void filesLargerThanFiveMegabytesAreRejected() {
        assertThrows(BusinessException.class,()->service.upload(101,
                new MockMultipartFile("file","avatar.jpg","image/jpeg",new byte[(int) AvatarService.MAX_FILE_SIZE+1])));
        verifyNoInteractions(storage);
    }
}
