-- Phase-one additive migration. Apply after 001_avalon_init.sql.
-- Stores only the current public holder on the game row. Inspection results remain private.
ALTER TABLE t_avalon_game
  ADD COLUMN lady_holder_player_id BIGINT NULL AFTER leader_player_id,
  ADD KEY idx_avalon_game_lady_holder (lady_holder_player_id),
  ADD CONSTRAINT fk_avalon_game_lady_holder
    FOREIGN KEY (lady_holder_player_id) REFERENCES t_avalon_player(id);

CREATE TABLE IF NOT EXISTS t_avalon_lady_inspection (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  sequence_no TINYINT NOT NULL,
  holder_player_id BIGINT NOT NULL,
  target_player_id BIGINT NOT NULL,
  result_alignment VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_lady_sequence (game_id, sequence_no),
  KEY idx_avalon_lady_game (game_id),
  CONSTRAINT fk_avalon_lady_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_lady_holder FOREIGN KEY (holder_player_id) REFERENCES t_avalon_player(id),
  CONSTRAINT fk_avalon_lady_target FOREIGN KEY (target_player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
