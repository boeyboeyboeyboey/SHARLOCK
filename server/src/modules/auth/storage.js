import { userModel } from '../../models/User.js'

function alreadyExists(error) {
  return error?.code === 48 || error?.codeName === 'NamespaceExists'
}

async function createCollection(database, name) {
  try {
    await database.db.createCollection(name)
  } catch (error) {
    if (!alreadyExists(error)) throw error
  }
}

export async function initializeAuthStorage(database) {
  if (!database?.db || database.readyState !== 1) {
    throw new TypeError('A connected Mongoose database is required.')
  }

  const User = userModel(database)
  await createCollection(database, 'users')
  await User.createIndexes()

  const sessions = database.db.collection('auth_sessions')
  await createCollection(database, 'auth_sessions')
  await sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 })
  await sessions.createIndex({ 'session.userId': 1 })
}
