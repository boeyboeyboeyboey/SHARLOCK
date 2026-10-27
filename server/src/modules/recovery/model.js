import { Schema } from 'mongoose'

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    purpose: {
      type: String,
      enum: ['activation', 'student-password-reset'],
      required: true,
      immutable: true,
    },
    tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
    authVersion: { type: Number, required: true, min: 1, immutable: true },
    initiatedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    activationRole: { type: String, enum: ['instructor', 'admin'], default: null, immutable: true },
    scopeCohortId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    consumedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, immutable: true },
  },
  { versionKey: false, strict: 'throw', autoIndex: false, autoCreate: false },
)
passwordResetSchema.index({ tokenHash: 1 }, { unique: true })
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
passwordResetSchema.index({ userId: 1, purpose: 1, consumedAt: 1, revokedAt: 1 })

export function passwordResetModel(database) {
  if (!database || typeof database.model !== 'function' || !database.models) {
    throw new TypeError('A connected Mongoose database is required.')
  }
  return (
    database.models.PasswordReset ||
    database.model('PasswordReset', passwordResetSchema, 'password_resets')
  )
}
