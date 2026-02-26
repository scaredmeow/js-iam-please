/**
 * Role Matrix — loads, queries, and serializes role permission configurations.
 *
 * The Role_Matrix defines which roles have which permissions on which resource
 * types and environments. It is loaded from JSON and used by the Decision Engine
 * to check whether a role has an explicit allow for a given action/resource/environment.
 */

export class RoleMatrixError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoleMatrixError';
  }
}

/**
 * Validate a role matrix configuration object.
 * @param {object} config - The role matrix config
 * @throws {RoleMatrixError} if invalid
 */
function validateRoleMatrix(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new RoleMatrixError('Role matrix config must be a non-null object');
  }
  if (typeof config.roles !== 'object' || config.roles === null || Array.isArray(config.roles)) {
    throw new RoleMatrixError('Role matrix config must have a "roles" object');
  }

  for (const [roleName, roleDef] of Object.entries(config.roles)) {
    if (typeof roleDef !== 'object' || roleDef === null || Array.isArray(roleDef)) {
      throw new RoleMatrixError(`Role "${roleName}" must be a non-null object`);
    }
    if (!Array.isArray(roleDef.permissions)) {
      throw new RoleMatrixError(`Role "${roleName}" must have a "permissions" array`);
    }
    for (let i = 0; i < roleDef.permissions.length; i++) {
      const perm = roleDef.permissions[i];
      if (!Array.isArray(perm.actions) || perm.actions.length === 0) {
        throw new RoleMatrixError(`Role "${roleName}" permission[${i}] must have a non-empty "actions" array`);
      }
      if (typeof perm.resourceType !== 'string') {
        throw new RoleMatrixError(`Role "${roleName}" permission[${i}] must have a "resourceType" string`);
      }
      if (!Array.isArray(perm.environments) || perm.environments.length === 0) {
        throw new RoleMatrixError(`Role "${roleName}" permission[${i}] must have a non-empty "environments" array`);
      }
    }
  }
}

/**
 * Parse a JSON string into a validated Role Matrix configuration.
 * @param {string} jsonString - Raw JSON string
 * @returns {object} Parsed and validated role matrix config
 * @throws {RoleMatrixError}
 */
export function parseRoleMatrix(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new RoleMatrixError('Input must be a JSON string');
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new RoleMatrixError(`Invalid JSON syntax: ${e.message}`);
  }
  validateRoleMatrix(parsed);
  return parsed;
}

/**
 * Serialize a Role Matrix configuration to a JSON string.
 * @param {object} config - A role matrix config object
 * @returns {string} JSON string
 * @throws {RoleMatrixError}
 */
export function printRoleMatrix(config) {
  validateRoleMatrix(config);
  return JSON.stringify(config);
}

/**
 * Check if a role has an explicit allow for a given action, resource type, and environment.
 * Returns the matching permission entry or null if no match (implicit deny).
 *
 * @param {object} config - The role matrix config
 * @param {string} role - The requester's role
 * @param {string} action - The requested action (e.g. "s3:GetObject")
 * @param {string} resourceType - The resource type (e.g. "s3")
 * @param {string} environment - The target environment (e.g. "dev", "prod")
 * @returns {object|null} The matching permission entry, or null
 */
export function lookupPermission(config, role, action, resourceType, environment) {
  const roleDef = config.roles[role];
  if (!roleDef) return null;

  for (const perm of roleDef.permissions) {
    // Check resource type match (wildcard or exact)
    if (perm.resourceType !== '*' && perm.resourceType !== resourceType) continue;

    // Check environment match
    if (!perm.environments.includes(environment)) continue;

    // Check action match (wildcard or exact)
    const actionMatches = perm.actions.includes('*') || perm.actions.includes(action);
    if (!actionMatches) continue;

    return perm;
  }

  return null;
}

/**
 * Get all role names defined in the matrix.
 * @param {object} config - The role matrix config
 * @returns {string[]}
 */
export function getRoleNames(config) {
  return Object.keys(config.roles);
}
