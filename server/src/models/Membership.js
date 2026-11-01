import { Schema } from 'mongoose'

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    cohortId: {
      type: Schema.Types.ObjectId,
      ref: 'Cohort',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'removed'],
      default: 'pending',
      required: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    decision: { type: String, enum: [null, 'approved', 'declined', 'removed'], default: null },
    revision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
    approvedAt: { type: Date, default: null },
    recoveryRevision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
      select: false,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    removedAt: { type: Date, default: null },
    removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: 'throw',
    autoIndex: false,
    autoCreate: false,
  },
)
membershipSchema.index({ userId: 1, cohortId: 1 }, { unique: true })
membershipSchema.index({ cohortId: 1, status: 1 })

export function membershipModel(database) {
  if (!database || typeof database.model !== 'function' || !database.models) {
    throw new TypeError('A connected Mongoose database is required.')
  }
  return database.models.Membership || database.model('Membership', membershipSchema, 'memberships')
}
