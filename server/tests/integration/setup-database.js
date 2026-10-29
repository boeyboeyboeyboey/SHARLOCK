import { randomBytes } from 'node:crypto'

// every integration file gets its own disposable database on the shared test server, so files
// that reset, seed or count collections never see another file's data while running in parallel
const baseUri = (process.env.SHARLOCK_TEST_BASE_URI ??= process.env.TEST_MONGODB_URI)

if (baseUri) {
  const url = new URL(baseUri)
  const baseName = url.pathname.slice(1).replace(/_test$/, '')
  url.pathname = `/${baseName}_${randomBytes(4).toString('hex')}_test`
  process.env.TEST_MONGODB_URI = url.toString()
}
