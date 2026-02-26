import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseRoleMatrix, printRoleMatrix } from '../../src/engine/role-matrix.js';

/**
 * Arbitrary generator for a single permission entry.
 */
const arbPermission = fc.record({
  actions: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  resourceType: fc.string({ minLength: 1 }),
  environments: fc.array(
    fc.constantFrom('dev', 'staging', 'prod'),
    { minLength: 1, maxLength: 3 }
  ),
  maxClassification: fc.option(
    fc.constantFrom('internal', 'confidential', 'restricted'),
    { nil: undefined }
  ),
  teamScoped: fc.option(fc.boolean(), { nil: undefined }),
  requiresBreakGlass: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Arbitrary generator for a valid Role Matrix configuration.
 * Generates 1-4 roles, each with 1-3 permissions.
 */
const arbRoleMatrix = fc.record({
  roles: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.record({
      permissions: fc.array(arbPermission, { minLength: 1, maxLength: 3 }),
    }),
    { minKeys: 1, maxKeys: 4 }
  ),
});

/**
 * Helper: normalize by stripping undefined keys (JSON round-trip drops them).
 */
function jsonNormalize(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Role Matrix', () => {
  /**
   * Feature: iam-please, Property 8: Role matrix serialization round-trip
   * Validates: Requirements 3.4, 3.5
   *
   * For any valid Role_Matrix configuration object, serializing it to JSON
   * and then deserializing the resulting JSON should produce a Role_Matrix
   * configuration equivalent to the original.
   */
  it('Property 8: parse(print(roleMatrix)) === roleMatrix for all valid configs', () => {
    fc.assert(
      fc.property(arbRoleMatrix, (config) => {
        const json = printRoleMatrix(config);
        const parsed = parseRoleMatrix(json);
        expect(parsed).toEqual(jsonNormalize(config));
      }),
      { numRuns: 100 }
    );
  });
});
