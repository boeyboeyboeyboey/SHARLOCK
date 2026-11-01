import Test from 'supertest/lib/test.js'

// supertest calls listen(0), which binds ::, then connects to 127.0.0.1. on macos that bind can land
// on a port another program holds on an ipv4 address, and that program answers the test with its own
// 404 or a socket hang up. ipv6 loopback reaches the server the test just started
const serverAddress = Test.prototype.serverAddress

Test.prototype.serverAddress = function connectOverIpv6(app, path) {
  const url = serverAddress.call(this, app, path)
  return app.address()?.address === '::' ? url.replace('://127.0.0.1:', '://[::1]:') : url
}
