-- Avalon fixed-seat lobby upgrade.
-- Non-destructive: existing seated players and the unique (game_id, seat_no) constraint are preserved.
-- MySQL unique indexes permit multiple NULL values, allowing several players to stand in one lobby.

ALTER TABLE t_avalon_game_player
  MODIFY COLUMN seat_no TINYINT NULL;
