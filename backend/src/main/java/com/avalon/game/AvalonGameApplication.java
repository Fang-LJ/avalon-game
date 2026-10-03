package com.avalon.game;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AvalonGameApplication {
    public static void main(String[] args) {
        SpringApplication.run(AvalonGameApplication.class, args);
    }
}
