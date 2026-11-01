// library: mongodb-connection-string-url (apache-2.0); credited in credits.md
import ConnectionString from 'mongodb-connection-string-url'

export function databaseNameFromUri(uri, label = 'MONGO_URI', fallbackName) {
  try {
    if (typeof uri !== 'string' || !uri.trim()) throw new Error()
    const parsed = new ConnectionString(uri)
    const name = decodeURIComponent(parsed.pathname.slice(1)) || fallbackName
    if (
      !name ||
      !/^[a-zA-Z0-9_-]+$/.test(name) ||
      ['admin', 'config', 'local'].includes(name.toLowerCase())
    ) {
      throw new Error()
    }
    // reject query overrides so the connection uses the database validated here
    if ([...parsed.searchParams.keys()].some((key) => key.toLowerCase() === 'dbname'))
      throw new Error()
    return name
  } catch {
    throw new Error(`${label} must be a MongoDB URI with an explicit, non-system database name.`)
  }
}

export function assertSafeTestDatabaseUri(testUri, developmentUri) {
  const testName = databaseNameFromUri(testUri, 'TEST_MONGODB_URI')
  if (!testName.endsWith('_test')) {
    throw new Error('TEST_MONGODB_URI database must end in _test.')
  }
  if (developmentUri) {
    const developmentName = databaseNameFromUri(developmentUri, 'MONGO_URI', 'sharlock_dev')
    // compare database names even when host aliases differ
    if (testName.toLowerCase() === developmentName.toLowerCase()) {
      throw new Error('Test and development database names must be different.')
    }
  }
  return testUri
}
