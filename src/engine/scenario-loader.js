/**
 * Scenario Loader — parses and validates scenario JSON, and prints scenario objects back to JSON.
 *
 * A Scenario represents a single access request ticket in the game.
 * Schema requires: id, day, title, request (with requester, actions, resources, justification),
 * expected (with decision, reasonCode, explanation), and teachingPoint.
 */

export class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [fields] - names of failing fields
   */
  constructor(message, fields = []) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

const REQUIRED_TOP_LEVEL = ['id', 'day', 'title', 'request', 'expected', 'teachingPoint'];
const REQUIRED_REQUEST = ['requester', 'actions', 'resources', 'justification'];
const REQUIRED_REQUESTER = ['name', 'role'];
const REQUIRED_EXPECTED = ['decision', 'reasonCode', 'explanation'];

/**
 * Validate that an object has all required string-keyed fields and they are non-null/undefined.
 * Returns an array of missing field names.
 */
function findMissing(obj, requiredKeys, prefix = '') {
  const missing = [];
  for (const key of requiredKeys) {
    if (obj[key] === undefined || obj[key] === null) {
      missing.push(prefix ? `${prefix}.${key}` : key);
    }
  }
  return missing;
}

/**
 * Deep-validate a scenario object (already parsed from JSON).
 * Throws ValidationError if invalid.
 */
function validateScenario(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new ValidationError('Scenario must be a non-null object');
  }

  const errors = [];

  // Top-level required fields
  const topMissing = findMissing(obj, REQUIRED_TOP_LEVEL);
  if (topMissing.length > 0) {
    errors.push(`Missing required fields: ${topMissing.join(', ')}`);
  }

  // Type checks for top-level fields
  if (obj.id !== undefined && typeof obj.id !== 'string') {
    errors.push('Field "id" must be a string');
  }
  if (obj.day !== undefined && (typeof obj.day !== 'number' || !Number.isInteger(obj.day) || obj.day < 1)) {
    errors.push('Field "day" must be a positive integer');
  }
  if (obj.title !== undefined && typeof obj.title !== 'string') {
    errors.push('Field "title" must be a string');
  }
  if (obj.teachingPoint !== undefined && typeof obj.teachingPoint !== 'string') {
    errors.push('Field "teachingPoint" must be a string');
  }

  // Validate request sub-object
  if (obj.request !== undefined) {
    if (typeof obj.request !== 'object' || obj.request === null || Array.isArray(obj.request)) {
      errors.push('Field "request" must be a non-null object');
    } else {
      const reqMissing = findMissing(obj.request, REQUIRED_REQUEST, 'request');
      if (reqMissing.length > 0) {
        errors.push(`Missing required fields: ${reqMissing.join(', ')}`);
      }

      // Validate requester sub-object
      if (obj.request.requester !== undefined) {
        if (typeof obj.request.requester !== 'object' || obj.request.requester === null || Array.isArray(obj.request.requester)) {
          errors.push('Field "request.requester" must be a non-null object');
        } else {
          const requesterMissing = findMissing(obj.request.requester, REQUIRED_REQUESTER, 'request.requester');
          if (requesterMissing.length > 0) {
            errors.push(`Missing required fields: ${requesterMissing.join(', ')}`);
          }
          if (obj.request.requester.name !== undefined && typeof obj.request.requester.name !== 'string') {
            errors.push('Field "request.requester.name" must be a string');
          }
          if (obj.request.requester.role !== undefined && typeof obj.request.requester.role !== 'string') {
            errors.push('Field "request.requester.role" must be a string');
          }
        }
      }

      if (obj.request.actions !== undefined && !Array.isArray(obj.request.actions)) {
        errors.push('Field "request.actions" must be an array');
      }
      if (obj.request.resources !== undefined && !Array.isArray(obj.request.resources)) {
        errors.push('Field "request.resources" must be an array');
      }
      if (obj.request.justification !== undefined && typeof obj.request.justification !== 'string') {
        errors.push('Field "request.justification" must be a string');
      }
    }
  }

  // Validate expected sub-object
  if (obj.expected !== undefined) {
    if (typeof obj.expected !== 'object' || obj.expected === null || Array.isArray(obj.expected)) {
      errors.push('Field "expected" must be a non-null object');
    } else {
      const expMissing = findMissing(obj.expected, REQUIRED_EXPECTED, 'expected');
      if (expMissing.length > 0) {
        errors.push(`Missing required fields: ${expMissing.join(', ')}`);
      }
      if (obj.expected.decision !== undefined && typeof obj.expected.decision !== 'string') {
        errors.push('Field "expected.decision" must be a string');
      }
      if (obj.expected.reasonCode !== undefined && typeof obj.expected.reasonCode !== 'string') {
        errors.push('Field "expected.reasonCode" must be a string');
      }
      if (obj.expected.explanation !== undefined && typeof obj.expected.explanation !== 'string') {
        errors.push('Field "expected.explanation" must be a string');
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '), errors);
  }
}

/**
 * Parse a JSON string into a validated Scenario object.
 * @param {string} jsonString - Raw JSON string
 * @returns {object} Parsed and validated scenario
 * @throws {ValidationError}
 */
export function parseScenario(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new ValidationError('Input must be a JSON string');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new ValidationError(`Invalid JSON syntax: ${e.message}`);
  }

  validateScenario(parsed);
  return parsed;
}

/**
 * Print a Scenario object to a JSON string conforming to the schema.
 * @param {object} scenario - A scenario object
 * @returns {string} JSON string
 */
export function printScenario(scenario) {
  validateScenario(scenario);
  return JSON.stringify(scenario);
}
