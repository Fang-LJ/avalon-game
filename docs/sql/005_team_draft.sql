-- Additive upgrade for existing V2 databases. Apply once before deploying the new backend.
-- Stores only the CURRENT proposal draft; never creates history or a new table.
-- Old backend versions ignore the nullable column and remain compatible.
ALTER TABLE t_avalon_game ADD COLUMN team_draft_json JSON NULL;
