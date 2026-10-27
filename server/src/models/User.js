import { Schema } from 'mongoose'
import { avatarPresets } from '../modules/auth/avatars.js'
import { HOW_TO_PLAY_GAME_IDS } from '../modules/profile/how-to-play.js'

// present only while an email address awaits verification. Accounts without it, including every
// account created before verification existed, count as verified.
const emailVerificationSchema = new Schema(
  {
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, required: true, min: 0, default: 0 },
    sendWindowStartedAt: { type: Date, required: true },
  },
  { _id: false, strict: 'throw' },
)

const userSchema = new Schema(
  {
    emailNormalized: { type: String, required: true, maxlength: 254, unique: true },
    username: { type: String, required: true, minlength: 3, maxlength: 32 },
    usernameNormalized: { type: String, required: true, minlength: 3, maxlength: 32, unique: true },
    avatarId: {
      type: String,
      required: true,
      enum: avatarPresets.map(({ id }) => id),
    },
    passwordHash: { type: String, required: true, select: false },
    globalRoles: {
      type: [String],
      enum: ['student', 'instructor', 'admin'],
      required: true,
      default: ['student'],
    },
    howToPlayDismissed: {
      type: [String],
      enum: HOW_TO_PLAY_GAME_IDS,
      default: [],
    },
    accountStatus: {
      type: String,
      enum: ['active', 'disabled', 'deleted'],
      required: true,
      default: 'active',
    },
    authVersion: { type: Number, required: true, min: 1, default: 1 },
    recoveryRevision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
      select: false,
    },
    emailVerifiedAt: { type: Date, default: null },
    emailVerification: { type: emailVerificationSchema, default: null, select: false },
    classOnboardingCompletedAt: { type: Date, default: null },
    instructorAssignmentRevision: {
      type: Number,
      required: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      default: 0,
      validate: Number.isSafeInteger,
    },
    passwordChangedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: 'throw',
    autoIndex: false,
    autoCreate: false,
  },
)

export function userModel(database) {
  if (!database || typeof database.model !== 'function' || !database.models) {
    throw new TypeError('A connected Mongoose database is required.')
  }
  return database.models.User || database.model('User', userSchema, 'users')
}
