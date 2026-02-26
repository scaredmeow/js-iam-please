import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluate } from '../../src/engine/decision-engine.js';

// --- Generators ---

const KNOWN_ROLES = ['Intern', 'Developer', 'Security Engineer', 'Data Analyst', 'Auditor', 'Admin'];
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
const CLASSIFICATIONS = ['internal', 'confidential', 'restricted'];
const RESOURCE_TYPES = ['s3', 'ec2', 'rds', 'lambda', 'iam', 'cloudtrail', 'guardduty', 'athena', 'config'];

function arbAction(resType) {
  const prefix = resType || fc.constantFrom(...RESOURCE_TYPES);
  if (typeof prefix === 'string') {
    return fc.constantFrom(
      `${prefix}:List`, `${prefix}:Get`, `${prefix}:Describe`, `${prefix}:Read`
    );
  }
  return prefix.chain(p =>
    fc.constantFrom(`${p}:List`, `${p}:Get`, `${p}:Describe`, `${p}:Read`)
  );
}

const arbResourceType = fc.constantFrom(...RESOURCE_TYPES);

/**
 * Generate a well-formed request object.
 */
const arbRequest = fc.record({
  requester: fc.record({
    role: fc.constantFrom(...KNOWN_ROLES),
    team: fc.constantFrom('alpha', 'beta', 'gamma', 'delta'),
  }),
  actions: fc.array(arbAction(), { minLength: 1, maxLength: 3 }),
  resources: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 2 }),
  environment: fc.constantFrom(...ENVIRONMENTS),
  resourceType: arbResourceType,
  resourceTeam: fc.constantFrom('alpha', 'beta', 'gamma', 'delta'),
  justification: fc.string({ minLength: 1 }),
  ticketId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  timeWindow: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  constraints: fc.record({
    dataClassification: fc.constantFrom(...CLASSIFICATIONS),
  }),
});

/**
 * A minimal role matrix with no permissions for any role — guarantees implicit deny.
 */
const EMPTY_ROLE_MATRIX = { roles: {} };

/**
 * A role matrix that allows everything for a specific role.
 */
function allowAllMatrix(role) {
  return {
    roles: {
      [role]: {
        permissions: [
          { actions: ['*'], resourceType: '*', environments: ['dev', 'staging', 'prod'] },
        ],
      },
    },
  };
}

/**
 * Build a simple role matrix that allows specific actions for a role.
 */
function simpleMatrix(role, actions, resourceType, environments) {
  return {
    roles: {
      [role]: {
        permissions: [
          { actions, resourceType, environments },
        ],
      },
    },
  };
}

// --- Property Tests ---

describe('Decision Engine', () => {

  /**
   * Feature: iam-please, Property 1: Implicit deny for unmatched requests
   * Validates: Requirements 1.1, 3.3
   *
   * For any access request where the requester's role has no matching allow
   * entry in the Role_Matrix, the Decision_Engine should return DENY.
   */
  it('Property 1: Implicit deny for unmatched requests', () => {
    fc.assert(
      fc.property(arbRequest, (request) => {
        const result = evaluate(request, EMPTY_ROLE_MATRIX, null, []);
        expect(result.decision).toBe('DENY');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 2: Explicit deny overrides allow
   * Validates: Requirements 1.2
   *
   * For any access request that would be allowed by the Role_Matrix, if any
   * active Guardrail matches with an explicit deny, the Decision_Engine should
   * return DENY regardless of the role allowance.
   */
  it('Property 2: Explicit deny overrides allow', () => {
    // Guardrail that denies any action starting with "s3:"
    const guardrails = [
      {
        id: 'deny-all-s3',
        type: 'scp',
        description: 'Deny all S3 actions',
        denyCondition: {
          actionPrefixes: ['s3:'],
        },
      },
    ];

    // Role matrix that allows s3 actions
    const roleMatrix = {
      roles: {
        Developer: {
          permissions: [
            { actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'], resourceType: 's3', environments: ['dev', 'staging', 'prod'] },
          ],
        },
      },
    };

    const arbS3Request = fc.record({
      requester: fc.record({
        role: fc.constant('Developer'),
        team: fc.constantFrom('alpha', 'beta'),
      }),
      actions: fc.array(
        fc.constantFrom('s3:GetObject', 's3:PutObject', 's3:ListBucket'),
        { minLength: 1, maxLength: 3 }
      ),
      resources: fc.array(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
        { minLength: 1, maxLength: 2 }
      ),
      environment: fc.constantFrom('dev', 'staging', 'prod'),
      resourceType: fc.constant('s3'),
      resourceTeam: fc.constantFrom('alpha', 'beta'),
      justification: fc.string({ minLength: 1 }),
      constraints: fc.record({
        dataClassification: fc.constantFrom('internal', 'confidential'),
      }),
    });

    fc.assert(
      fc.property(arbS3Request, (request) => {
        // Without guardrails, should approve
        const withoutGuardrails = evaluate(request, roleMatrix, null, []);
        expect(withoutGuardrails.decision).toBe('APPROVE');

        // With guardrails, should deny
        const withGuardrails = evaluate(request, roleMatrix, null, guardrails);
        expect(withGuardrails.decision).toBe('DENY');
        expect(withGuardrails.reasonCode).toContain('guardrail');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 3: Wildcard and Admin break-glass constraints
   * Validates: Requirements 1.4, 1.5
   *
   * For any access request containing wildcard actions or wildcard resources,
   * the Decision_Engine should deny unless both a valid ticket ID and time window are present.
   */
  it('Property 3: Wildcard and Admin break-glass constraints', () => {
    const adminMatrix = {
      roles: {
        Admin: {
          permissions: [
            { actions: ['*'], resourceType: '*', environments: ['dev', 'staging', 'prod'], requiresBreakGlass: true },
          ],
        },
      },
    };

    const arbWildcardRequest = fc.record({
      requester: fc.record({
        role: fc.constant('Admin'),
        team: fc.constantFrom('alpha', 'beta'),
      }),
      actions: fc.constant(['*']),
      resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
      environment: fc.constantFrom('dev', 'staging', 'prod'),
      resourceType: fc.constantFrom(...RESOURCE_TYPES),
      justification: fc.string({ minLength: 1 }),
      // Explicitly no ticketId or timeWindow
      constraints: fc.record({
        dataClassification: fc.constantFrom('internal', 'confidential'),
      }),
    });

    // Without ticket/timeWindow → DENY
    fc.assert(
      fc.property(arbWildcardRequest, (request) => {
        const result = evaluate(request, adminMatrix, null, []);
        expect(result.decision).toBe('DENY');
      }),
      { numRuns: 100 }
    );

    // With both ticket and timeWindow → APPROVE
    const arbBreakGlassRequest = fc.record({
      requester: fc.record({
        role: fc.constant('Admin'),
        team: fc.constantFrom('alpha', 'beta'),
      }),
      actions: fc.constant(['*']),
      resources: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 2 }),
      environment: fc.constantFrom('dev', 'staging', 'prod'),
      resourceType: fc.constantFrom(...RESOURCE_TYPES),
      justification: fc.string({ minLength: 1 }),
      ticketId: fc.string({ minLength: 1 }),
      timeWindow: fc.string({ minLength: 1 }),
      constraints: fc.record({
        dataClassification: fc.constantFrom('internal', 'confidential'),
      }),
    });

    fc.assert(
      fc.property(arbBreakGlassRequest, (request) => {
        const result = evaluate(request, adminMatrix, null, []);
        expect(result.decision).toBe('APPROVE');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 4: Decision result completeness
   * Validates: Requirements 1.6
   *
   * For any access request evaluated by the Decision_Engine, the returned result
   * should contain all three fields: decision, reasonCode, and explanation.
   */
  it('Property 4: Decision result completeness', () => {
    const arbAnyMatrix = fc.constantFrom(
      EMPTY_ROLE_MATRIX,
      allowAllMatrix('Developer'),
      allowAllMatrix('Intern'),
    );

    fc.assert(
      fc.property(arbRequest, arbAnyMatrix, (request, matrix) => {
        const result = evaluate(request, matrix, null, []);

        expect(result).toHaveProperty('decision');
        expect(result).toHaveProperty('reasonCode');
        expect(result).toHaveProperty('explanation');

        expect(['APPROVE', 'DENY']).toContain(result.decision);
        expect(typeof result.reasonCode).toBe('string');
        expect(result.reasonCode.length).toBeGreaterThan(0);
        expect(typeof result.explanation).toBe('string');
        expect(result.explanation.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: iam-please, Property 5: ABAC overlay enforcement
   * Validates: Requirements 3.2
   *
   * For any access request evaluated when the ABAC_Overlay is active, if the
   * request violates any ABAC constraint, the Decision_Engine should return DENY
   * even if the Role_Matrix would allow the action.
   */
  it('Property 5: ABAC overlay enforcement', () => {
    // ABAC rule: Interns cannot access prod
    const abacOverlay = {
      active: true,
      rules: [
        {
          id: 'intern-no-prod',
          dimension: 'environment',
          description: 'Interns cannot access production environments',
          condition: {
            requesterRole: 'Intern',
            deniedEnvironments: ['prod'],
          },
        },
      ],
    };

    // Role matrix that would allow Intern in prod
    const permissiveMatrix = {
      roles: {
        Intern: {
          permissions: [
            { actions: ['s3:GetObject', 's3:ListBucket'], resourceType: 's3', environments: ['dev', 'staging', 'prod'] },
          ],
        },
      },
    };

    const arbInternProdRequest = fc.record({
      requester: fc.record({
        role: fc.constant('Intern'),
        team: fc.constantFrom('alpha', 'beta'),
      }),
      actions: fc.array(
        fc.constantFrom('s3:GetObject', 's3:ListBucket'),
        { minLength: 1, maxLength: 2 }
      ),
      resources: fc.array(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
        { minLength: 1, maxLength: 2 }
      ),
      environment: fc.constant('prod'),
      resourceType: fc.constant('s3'),
      resourceTeam: fc.constantFrom('alpha', 'beta'),
      justification: fc.string({ minLength: 1 }),
      constraints: fc.record({
        dataClassification: fc.constant('internal'),
      }),
    });

    fc.assert(
      fc.property(arbInternProdRequest, (request) => {
        // Without ABAC, should approve
        const withoutABAC = evaluate(request, permissiveMatrix, null, []);
        expect(withoutABAC.decision).toBe('APPROVE');

        // With ABAC, should deny
        const withABAC = evaluate(request, permissiveMatrix, abacOverlay, []);
        expect(withABAC.decision).toBe('DENY');
        expect(withABAC.reasonCode).toContain('abac');
      }),
      { numRuns: 100 }
    );
  });
});
