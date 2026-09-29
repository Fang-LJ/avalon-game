-- Avalon Game V1 -> V2 destructive rebuild for existing development databases.
-- BACK UP every t_avalon_* table and verify the data is disposable before running.
-- This script never touches non-Avalon tables. It intentionally does not preserve V1 rows.

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS t_avalon_lady_action;
DROP TABLE IF EXISTS t_avalon_lady_inspection;
DROP TABLE IF EXISTS t_avalon_mission_action;
DROP TABLE IF EXISTS t_avalon_vote;
DROP TABLE IF EXISTS t_avalon_mission;
DROP TABLE IF EXISTS t_avalon_proposal;
DROP TABLE IF EXISTS t_avalon_game_player;
DROP TABLE IF EXISTS t_avalon_player;
DROP TABLE IF EXISTS t_avalon_game;
DROP TABLE IF EXISTS t_avalon_room;
DROP TABLE IF EXISTS t_avalon_user_identity;
DROP TABLE IF EXISTS t_avalon_user;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS t_avalon_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_user_provider_identity (provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_game (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_code CHAR(6) NOT NULL,
  owner_user_id BIGINT NOT NULL,
  player_count TINYINT NOT NULL,
  rule_version VARCHAR(32) NOT NULL DEFAULT 'AVALON_V1',
  status VARCHAR(20) NOT NULL,
  phase VARCHAR(32) NULL,
  mission_no TINYINT NOT NULL DEFAULT 1,
  proposal_no TINYINT NOT NULL DEFAULT 1,
  leader_game_player_id BIGINT NULL,
  consecutive_rejections TINYINT NOT NULL DEFAULT 0,
  good_score TINYINT NOT NULL DEFAULT 0,
  evil_score TINYINT NOT NULL DEFAULT 0,
  lady_holder_game_player_id BIGINT NULL,
  winner_alignment VARCHAR(16) NULL,
  finish_reason VARCHAR(64) NULL,
  assassination_target_game_player_id BIGINT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_avalon_game_room_status (room_code, status),
  KEY idx_avalon_game_owner_status (owner_user_id, status),
  CONSTRAINT fk_avalon_game_owner FOREIGN KEY (owner_user_id) REFERENCES t_avalon_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_game_player (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  seat_no TINYINT NULL,
  nickname_snapshot VARCHAR(64) NOT NULL,
  role_code VARCHAR(32) NULL,
  alignment VARCHAR(16) NULL,
  role_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  is_online TINYINT(1) NOT NULL DEFAULT 1,
  left_at DATETIME NULL,
  joined_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_game_user (game_id, user_id),
  UNIQUE KEY uk_avalon_game_seat (game_id, seat_no),
  KEY idx_avalon_game_player_user_game (user_id, game_id),
  CONSTRAINT fk_avalon_game_player_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_game_player_user FOREIGN KEY (user_id) REFERENCES t_avalon_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE t_avalon_game
  ADD CONSTRAINT fk_avalon_game_leader FOREIGN KEY (leader_game_player_id) REFERENCES t_avalon_game_player(id),
  ADD CONSTRAINT fk_avalon_game_lady_holder FOREIGN KEY (lady_holder_game_player_id) REFERENCES t_avalon_game_player(id),
  ADD CONSTRAINT fk_avalon_game_assassination_target FOREIGN KEY (assassination_target_game_player_id) REFERENCES t_avalon_game_player(id);

CREATE TABLE IF NOT EXISTS t_avalon_proposal (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  mission_no TINYINT NOT NULL,
  proposal_no TINYINT NOT NULL,
  leader_game_player_id BIGINT NOT NULL,
  team_player_ids JSON NOT NULL,
  status VARCHAR(16) NOT NULL,
  approve_count TINYINT NOT NULL DEFAULT 0,
  reject_count TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  UNIQUE KEY uk_avalon_proposal_round (game_id, mission_no, proposal_no),
  KEY idx_avalon_proposal_game_status (game_id, status),
  CONSTRAINT fk_avalon_proposal_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_proposal_leader FOREIGN KEY (leader_game_player_id) REFERENCES t_avalon_game_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_vote (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  proposal_id BIGINT NOT NULL,
  game_player_id BIGINT NOT NULL,
  vote_choice VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_vote_once (proposal_id, game_player_id),
  CONSTRAINT fk_avalon_vote_proposal FOREIGN KEY (proposal_id) REFERENCES t_avalon_proposal(id),
  CONSTRAINT fk_avalon_vote_player FOREIGN KEY (game_player_id) REFERENCES t_avalon_game_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_mission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  mission_no TINYINT NOT NULL,
  approved_proposal_id BIGINT NOT NULL,
  required_players TINYINT NOT NULL,
  fail_threshold TINYINT NOT NULL,
  success_count TINYINT NULL,
  fail_count TINYINT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  UNIQUE KEY uk_avalon_mission_round (game_id, mission_no),
  UNIQUE KEY uk_avalon_mission_proposal (approved_proposal_id),
  CONSTRAINT fk_avalon_mission_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_mission_proposal FOREIGN KEY (approved_proposal_id) REFERENCES t_avalon_proposal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_mission_action (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mission_id BIGINT NOT NULL,
  game_player_id BIGINT NOT NULL,
  action_choice VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_mission_action_once (mission_id, game_player_id),
  CONSTRAINT fk_avalon_mission_action_mission FOREIGN KEY (mission_id) REFERENCES t_avalon_mission(id),
  CONSTRAINT fk_avalon_mission_action_player FOREIGN KEY (game_player_id) REFERENCES t_avalon_game_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_lady_action (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  sequence_no TINYINT NOT NULL,
  holder_game_player_id BIGINT NOT NULL,
  target_game_player_id BIGINT NOT NULL,
  result_alignment VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_lady_sequence (game_id, sequence_no),
  UNIQUE KEY uk_avalon_lady_holder (game_id, holder_game_player_id),
  UNIQUE KEY uk_avalon_lady_target (game_id, target_game_player_id),
  CONSTRAINT fk_avalon_lady_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_lady_holder FOREIGN KEY (holder_game_player_id) REFERENCES t_avalon_game_player(id),
  CONSTRAINT fk_avalon_lady_target FOREIGN KEY (target_game_player_id) REFERENCES t_avalon_game_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
