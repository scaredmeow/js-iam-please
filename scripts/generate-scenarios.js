#!/usr/bin/env node

/**
 * Gemini CLI Script — generates IAM scenarios offline and pushes them to Supabase.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/generate-scenarios.js --day 4 --count 3
 *
 * The Gemini API key is read from the GEMINI_API_KEY environment variable (never hardcoded).
 * This script can also run in GitHub Actions with the key stored as a GitHub Secret.
 */

import { createClient } from '@supabase/supabase-js';
import { parseScenario } from '../src/engine/scenario-loader.js';
import { getFeaturesForDay } from '../src/engine/game-controller.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SUPABASE_URL = 'https://chhrprxsqvnabdhjicnp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoaHJwcnhzcXZuYWJkaGppY25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTY2MzksImV4cCI6MjA4NzY5MjYzOX0.E45fo1Fk_pUZ8olu1HTJwEtwAaNXrY5H8W-9HHJuKNs';

const MAX_RETRIES = 2;

/**
 * Load a JSON data file from src/data/.
 * @param {string} filename
 * @returns {object}
 */
function loadDataFile(filename) {
  const filePath = path.resolve(__dirname, '..', 'src', 'data', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Determine the target difficulty range for a given day.
 * @param {number} day
 * @returns {{ min: number, max: number }}
 */
function getDifficultyForDay(day) {
  if (day <= 3) return { min: 1, max: 2 };
  if (day <= 7) return { min: 2, max: 4 };
  if (day <= 11) return { min: 3, max: 5 };
  return { min: 4, max: 6 };
}

/**
 * Build a structured prompt for Gemini that includes the full act context.
 *
 * The prompt includes:
 * - The role matrix (always)
 * - Active ABAC rules (if day >= 4)
 * - Active guardrails (if day >= 8)
 * - Target difficulty level matching the day's act
 * - Day number and count
 *
 * @param {number} day - Day number
 * @param {object} roleMatrix - The roles.json data
 * @param {object|null} abacOverlay - The abac-rules.json data (null if not active)
 * @param {object[]} guardrails - The guardrails array (empty if not active)
 * @param {number} count - Number of scenarios to generate
 * @returns {string} The complete prompt text
 */
export function buildScenarioPrompt(day, roleMatrix, abacOverlay, guardrails, count) {
  const features = getFeaturesForDay(day);
  const difficulty = getDifficultyForDay(day);

  let prompt = `You are a scenario designer for an IAM access control training game called "IAM Please".
Generate ${count} unique IAM access request scenarios for day ${day}.

Each scenario must be a JSON object with this exact schema:
{
  "id": "unique-kebab-case-id",
  "day": ${day},
  "title": "Short descriptive title",
  "difficulty": <number between ${difficulty.min} and ${difficulty.max}>,
  "request": {
    "requester": { "name": "PersonName", "role": "RoleName", "team": "teamname" },
    "environment": "dev|staging|prod",
    "actions": ["service:Action"],
    "resources": ["arn:aws:..."],
    "justification": "Why they need access",
    "constraints": { "dataClassification": "internal|confidential|restricted" }
  },
  "expected": {
    "decision": "APPROVE|DENY",
    "reasonCode": "kebab-case-reason",
    "explanation": "Why this decision is correct"
  },
  "teachingPoint": "What the player should learn from this scenario"
}

Return a JSON array of ${count} scenario objects.

## Role Matrix

The following roles and permissions are defined in the system:

${JSON.stringify(roleMatrix, null, 2)}
`;

  if (features.abac && abacOverlay) {
    prompt += `
## ABAC Rules (Active for Day ${day})

The following attribute-based access control rules are active and MUST be considered:

${JSON.stringify(abacOverlay, null, 2)}
`;
  }

  if (features.guardrails && guardrails.length > 0) {
    prompt += `
## Guardrails (Active for Day ${day})

The following organizational guardrails (SCPs, permission boundaries) are active and MUST be considered:

${JSON.stringify(guardrails, null, 2)}
`;
  }

  prompt += `
## Active Features for Day ${day}

- RBAC (Role-Based Access Control): ALWAYS active
- ABAC (Attribute-Based Access Control): ${features.abac ? 'ACTIVE' : 'NOT active'}
- Guardrails (SCPs, Permission Boundaries): ${features.guardrails ? 'ACTIVE' : 'NOT active'}
- Break-Glass / Advanced scenarios: ${features.breakGlass ? 'ACTIVE' : 'NOT active'}

## Difficulty Target

Target difficulty range: ${difficulty.min}-${difficulty.max} (scale of 1-6).
Mix APPROVE and DENY scenarios. Include tricky edge cases appropriate for the difficulty level.
`;

  return prompt;
}

/**
 * Send a prompt to the Gemini API and return the text response.
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function generateContent(prompt, apiKey) {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned no content');
  }
  return text;
}

/**
 * Parse CLI arguments.
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ day: number, count: number }}
 */
function parseArgs(args) {
  let day = null;
  let count = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!day || day < 1) {
    console.error('Usage: node scripts/generate-scenarios.js --day <number> [--count <number>]');
    process.exit(1);
  }

  return { day, count };
}

/**
 * Main entry point: generate scenarios, validate, and store in Supabase.
 */
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  const { day, count } = parseArgs(process.argv.slice(2));

  // Load game data
  const roleMatrix = loadDataFile('roles.json');
  const abacData = loadDataFile('abac-rules.json');
  const guardrailsData = loadDataFile('guardrails.json');

  const features = getFeaturesForDay(day);
  const abacOverlay = features.abac ? abacData : null;
  const guardrails = features.guardrails ? (guardrailsData.guardrails || []) : [];

  const prompt = buildScenarioPrompt(day, roleMatrix, abacOverlay, guardrails, count);

  console.log(`Generating ${count} scenarios for day ${day}...`);

  let validScenarios = [];
  let attempts = 0;

  while (validScenarios.length === 0 && attempts <= MAX_RETRIES) {
    if (attempts > 0) {
      console.log(`Retry ${attempts}/${MAX_RETRIES}...`);
    }

    try {
      const responseText = await generateContent(prompt, apiKey);
      const parsed = JSON.parse(responseText);
      const scenarios = Array.isArray(parsed) ? parsed : [parsed];

      for (const scenario of scenarios) {
        try {
          // Validate using the existing parseScenario (expects a JSON string)
          parseScenario(JSON.stringify(scenario));
          validScenarios.push(scenario);
        } catch (err) {
          console.warn(`Invalid scenario "${scenario.id || 'unknown'}": ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`Generation attempt ${attempts + 1} failed: ${err.message}`);
    }

    attempts++;
  }

  if (validScenarios.length === 0) {
    console.error('Failed to generate valid scenarios after all retries');
    process.exit(1);
  }

  console.log(`Generated ${validScenarios.length} valid scenario(s)`);

  // Save locally to src/data/scenarios/dayN.json
  const scenariosDir = path.resolve(__dirname, '..', 'src', 'data', 'scenarios');
  const localPath = path.join(scenariosDir, `day${day}.json`);

  // Merge with existing local scenarios if file exists
  let existingLocal = [];
  try {
    existingLocal = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  } catch { /* file doesn't exist yet */ }

  const existingIds = new Set(existingLocal.map(s => s.id));
  const newScenarios = validScenarios.filter(s => !existingIds.has(s.id));
  const merged = [...existingLocal, ...newScenarios];

  fs.writeFileSync(localPath, JSON.stringify(merged, null, 2));
  console.log(`Saved ${newScenarios.length} new scenario(s) to ${localPath} (${merged.length} total)`);

  // Store in Supabase (use service role key if available to bypass RLS for upserts)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, supabaseKey);
  let stored = 0;

  for (const scenario of validScenarios) {
    const row = {
      id: scenario.id,
      day: scenario.day,
      difficulty: scenario.difficulty || 1,
      scenario_data: scenario,
      source: 'ai-generated',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('scenarios').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn(`Failed to store scenario "${scenario.id}": ${error.message}`);
    } else {
      stored++;
    }
  }

  console.log(`Stored ${stored}/${validScenarios.length} scenario(s) in Supabase`);
}

// Only run main() when executed directly (not when imported for testing)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
