-- Avalon Game MVP schema. Safe to run in the same MySQL database as playmate-space:
-- every table is isolated behind the t_avalon_ prefix.
CREATE TABLE IF NOT EXISTS t_avalon_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  nickname VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_user_identity (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_identity (provider, provider_user_id),
  KEY idx_avalon_identity_user (user_id),
  CONSTRAINT fk_avalon_identity_user FOREIGN KEY (user_id) REFERENCES t_avalon_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_room (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_code CHAR(6) NOT NULL,
  owner_user_id BIGINT NOT NULL,
  max_players TINYINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  current_game_id BIGINT NULL,
  created_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_room_code (room_code),
  KEY idx_avalon_room_owner (owner_user_id),
  CONSTRAINT fk_avalon_room_owner FOREIGN KEY (owner_user_id) REFERENCES t_avalon_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_player (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  seat_no TINYINT NOT NULL,
  is_host TINYINT(1) NOT NULL DEFAULT 0,
  is_ready TINYINT(1) NOT NULL DEFAULT 0,
  is_online TINYINT(1) NOT NULL DEFAULT 1,
  left_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_room_user (room_id, user_id),
  UNIQUE KEY uk_avalon_room_seat (room_id, seat_no),
  KEY idx_avalon_player_user (user_id),
  CONSTRAINT fk_avalon_player_room FOREIGN KEY (room_id) REFERENCES t_avalon_room(id),
  CONSTRAINT fk_avalon_player_user FOREIGN KEY (user_id) REFERENCES t_avalon_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_game (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id BIGINT NOT NULL,
  mission_no TINYINT NOT NULL,
  leader_player_id BIGINT NOT NULL,
  proposal_no TINYINT NOT NULL,
  consecutive_rejections TINYINT NOT NULL,
  good_score TINYINT NOT NULL,
  evil_score TINYINT NOT NULL,
  phase VARCHAR(32) NOT NULL,
  winner VARCHAR(16) NULL,
  finish_reason VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_avalon_game_room (room_id),
  CONSTRAINT fk_avalon_game_room FOREIGN KEY (room_id) REFERENCES t_avalon_room(id),
  CONSTRAINT fk_avalon_game_leader FOREIGN KEY (leader_player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_game_player (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  player_id BIGINT NOT NULL,
  role_code VARCHAR(32) NOT NULL,
  alignment VARCHAR(16) NOT NULL,
  role_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_game_player (game_id, player_id),
  CONSTRAINT fk_avalon_gp_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_gp_player FOREIGN KEY (player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_mission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  mission_no TINYINT NOT NULL,
  proposal_no TINYINT NOT NULL,
  leader_player_id BIGINT NOT NULL,
  team_player_ids VARCHAR(255) NOT NULL,
  required_players TINYINT NOT NULL,
  fail_threshold TINYINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  success_count TINYINT NULL,
  fail_count TINYINT NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  UNIQUE KEY uk_avalon_mission_proposal (game_id, mission_no, proposal_no),
  CONSTRAINT fk_avalon_mission_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_mission_leader FOREIGN KEY (leader_player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_vote (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id BIGINT NOT NULL,
  mission_id BIGINT NOT NULL,
  mission_no TINYINT NOT NULL,
  proposal_no TINYINT NOT NULL,
  player_id BIGINT NOT NULL,
  vote_choice VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_vote_once (mission_id, player_id),
  KEY idx_avalon_vote_game_round (game_id, mission_no, proposal_no),
  CONSTRAINT fk_avalon_vote_game FOREIGN KEY (game_id) REFERENCES t_avalon_game(id),
  CONSTRAINT fk_avalon_vote_mission FOREIGN KEY (mission_id) REFERENCES t_avalon_mission(id),
  CONSTRAINT fk_avalon_vote_player FOREIGN KEY (player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_avalon_mission_action (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mission_id BIGINT NOT NULL,
  player_id BIGINT NOT NULL,
  action_choice VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_avalon_mission_action_once (mission_id, player_id),
  CONSTRAINT fk_avalon_action_mission FOREIGN KEY (mission_id) REFERENCES t_avalon_mission(id),
  CONSTRAINT fk_avalon_action_player FOREIGN KEY (player_id) REFERENCES t_avalon_player(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
