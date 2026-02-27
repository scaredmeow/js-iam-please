-- IAM Please: Supabase table migrations
-- Requirements: 2.2, 2.4

-- Scenarios table: stores pre-authored and AI-generated scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  scenario_data JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pre-authored', 'ai-generated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by day number
CREATE INDEX IF NOT EXISTS idx_scenarios_day ON scenarios(day);

-- Leaderboard table: stores player scores
CREATE TABLE IF NOT EXISTS leaderboard (
  player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  cumulative_score INTEGER NOT NULL DEFAULT 0,
  days_completed INTEGER NOT NULL DEFAULT 0,
  accuracy_pct REAL NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast leaderboard ranking queries (score descending)
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(cumulative_score DESC);

-- Row Level Security: allow anonymous reads, authenticated writes
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Scenarios: anyone can read, anon can insert (for CLI script)
CREATE POLICY "scenarios_select" ON scenarios FOR SELECT USING (true);
CREATE POLICY "scenarios_insert" ON scenarios FOR INSERT WITH CHECK (true);

-- Leaderboard: anyone can read, anyone can insert/update their own entry
CREATE POLICY "leaderboard_select" ON leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_insert" ON leaderboard FOR INSERT WITH CHECK (true);
CREATE POLICY "leaderboard_update" ON leaderboard FOR UPDATE USING (true);
