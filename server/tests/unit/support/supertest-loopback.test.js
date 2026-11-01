import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import request from 'supertest'

const answer = (_request, response) => response.end('ok')

describe('supertest test servers', () => {
  it('reaches a bare listen(0) server over the address family it bound', async () => {
    const test = request(answer).get('/')
    expect(test.url).toMatch(test.app.address().address === '::' ? /\/\/\[::1\]:/ : /\/\/127\./)
    await test.expect(200, 'ok')
  })

  it('leaves a server the test bound to 127.0.0.1 alone', async () => {
    const server = createServer(answer)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const test = request(server).get('/')
    expect(test.url).toContain('//127.0.0.1:')
    await test.expect(200, 'ok')
    await new Promise((resolve) => server.close(resolve))
  })

  it('keeps cookies across requests from one agent', async () => {
    const agent = request.agent((incoming, response) => {
      if (incoming.url === '/set') response.setHeader('Set-Cookie', 'a=b; Path=/')
      response.end(incoming.headers.cookie ?? '')
    })
    await agent.get('/set').expect(200)
    await agent.get('/read').expect(200, 'a=b')
  })
})
