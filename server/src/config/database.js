// library: mongoose (mit), models and queries; credited in credits.md
import mongoose from 'mongoose'
import { databaseNameFromUri } from './database-uri.js'

export async function connectDatabase(uri) {
  const dbName = databaseNameFromUri(uri, 'MONGO_URI', 'sharlock_dev')
  return mongoose
    .createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      bufferCommands: false,
      autoCreate: false,
    })
    .asPromise()
}
