import { prisma } from "@/lib/prisma";

// Human-readable labels for audit actions, for use in the admin logs UI.
export const AUDIT_ACTION_LABELS = {
  LOGIN: "ログイン",
  USER_UPDATE: "ユーザー情報変更",
};

/**
 * Records an admin/teacher action ("who did what") to the AuditLog table.
 * Failures are logged but never thrown — audit logging must not break the
 * request that triggered it.
 *
 * @param {Object} params
 * @param {string} params.actor - identifier of who performed the action (email or studentId)
 * @param {string} [params.actorName] - display name at the time of the action
 * @param {string} params.action - action type, e.g. "LOGIN", "USER_UPDATE"
 * @param {string} [params.targetType] - kind of thing changed, e.g. "User"
 * @param {string|number} [params.targetId] - id of the thing changed, e.g. a studentId
 */
export async function logAudit({ actor, actorName, action, targetType, targetId }) {
  try {
    await prisma.auditLog.create({
      data: {
        actor: actor ? String(actor) : "unknown",
        actorName: actorName ? String(actorName) : null,
        action,
        targetType: targetType || null,
        targetId: targetId != null ? String(targetId) : null,
      },
    });
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
}
