#!/usr/bin/env node

/**
 * Push all local scenario JSON files (day1–day10) to Supabase.
 * Usage: node scripts/push-all-scenarios.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://chhrprxsqvnabdhjicnp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoaHJwcnhzcXZuYWJkaGppY25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTY2MzksImV4cCI6MjA4NzY5MjYzOX0.E45fo1Fk_pUZ8olu1HTJwEtwAaNXrY5H8W-9HHJuKNs';

async function main() {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, supabaseKey);

  const scenariosDir = path.resolve(__dirname, '..', 'src', 'data', 'scenarios');
  let totalStored = 0;
  let totalFailed = 0;

  for (let day = 1; day <= 10; day++) {
    const filePath = path.join(scenariosDir, `day${day}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping day ${day} — no file found`);
      continue;
    }

    const scenarios = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`Day ${day}: ${scenarios.length} scenario(s)`);

    for (const scenario of scenarios) {
      const row = {
        id: scenario.id,
        day: scenario.day,
        difficulty: scenario.difficulty || 1,
        scenario_data: scenario,
        source: 'pre-authored',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('scenarios').upsert(row, { onConflict: 'id' });
      if (error) {
        console.warn(`  ✗ "${scenario.id}": ${error.message}`);
        totalFailed++;
      } else {
        console.log(`  ✓ ${scenario.id}`);
        totalStored++;
      }
    }
  }

  console.log(`\nDone: ${totalStored} stored, ${totalFailed} failed`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
