/** One predicate for runtime transactions, health and owner-side probes. */
function runtimeRoleSafety(subject: string) {
  return `EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = ${subject} AND r.rolname = 'guide_runtime'
    AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT pg_has_role(r.oid, COALESCE(
      (SELECT relowner FROM pg_class WHERE oid = to_regclass('app.guide')),
      (SELECT datdba FROM pg_database WHERE datname = current_database())), 'MEMBER'))`;
}
export const runtimeRoleIsSafe = runtimeRoleSafety('current_user');
/** Parameterized query fragment; pass values with the owner connection query. */
export function runtimeRoleIsSafeFor(role: string) {
  return { text: `SELECT ${runtimeRoleSafety('$1')} AS safe`, values: [role] };
}
