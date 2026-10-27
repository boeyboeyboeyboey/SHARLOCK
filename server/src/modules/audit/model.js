import { Schema } from 'mongoose'
import { accountDeleteReasonCategories, auditEventTypes } from './policy.js'

const auditEventSchema = new Schema(
  {
    eventType: { type: String, enum: auditEventTypes, required: true },
    actorKind: { type: String, enum: ['user', 'operator'], required: true },
    actorId: {
      type: Schema.Types.ObjectId,
      default: null,
      required() {
        return this.actorKind === 'user'
      },
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    scopeCohortId: { type: Schema.Types.ObjectId, default: null },
    outcome: { type: String, enum: ['success', 'refused', 'failure'], required: true },
    targetRole: { type: String, enum: ['student'] },
    accountOutcome: { type: String, enum: ['deleted', 'anonymised'] },
    reasonCategory: { type: String, enum: accountDeleteReasonCategories },
    reasonNote: { type: String, minlength: 10, maxlength: 500 },
    occurredAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    requestId: { type: String, required: true },
  },
  {
    versionKey: false,
    strict: 'throw',
    autoIndex: false,
    autoCreate: false,
  },
)

auditEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
auditEventSchema.index({ occurredAt: -1, _id: -1 })
auditEventSchema.index({ eventType: 1, occurredAt: -1 })

export function auditEventModel(database) {
  if (!database || typeof database.model !== 'function' || !database.models) {
    throw new TypeError('A connected Mongoose database is required.')
  }
  return (
    database.models.AuditEvent || database.model('AuditEvent', auditEventSchema, 'audit_events')
  )
}
