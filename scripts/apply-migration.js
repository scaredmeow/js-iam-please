#!/usr/bin/env node

/**
 * Apply Supabase migration by executing SQL via the Supabase pg endpoint.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/apply-migration.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://chhrprxsqvnabdhjicnp.supabase.co';
const SUPABASE_PROJECT_REF = 'chhrprxsqvnabdhjicnp';

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }

  const sqlPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '001_create_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Applying migration to Supabase...');

  // Use the Supabase Management API SQL endpoint
  const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (response.ok) {
    console.log('Migration applied successfully!');
    return;
  }

  const errorText = await response.text();
  console.log(`Management API returned ${response.status}: ${errorText}`);
  console.log('\nTrying alternative approach via PostgREST...');

  // Alternative: create an exec_sql function first, then use it
  // This won't work without dashboard access, so print instructions
  console.log('\n========================================');
  console.log('Please run the SQL manually in your Supabase Dashboard:');
  console.log(`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql`);
  console.log('========================================\n');
  console.log(sql);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
