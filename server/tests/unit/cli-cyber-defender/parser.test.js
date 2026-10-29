import { describe, expect, it } from 'vitest'
import {
  SYNTAX_HINTS,
  formatCommand,
  isIpv4,
  parseCommand,
} from '../../../src/modules/games/cli-cyber-defender/parser.js'

describe('cli command parser', () => {
  it.each([
    ['block ip 192.0.2.10', 'block-ip', '192.0.2.10'],
    ['  BLOCK   IP   203.0.113.45  ', 'block-ip', '203.0.113.45'],
    ['disable user trainee-03', 'disable-user', 'trainee-03'],
    ['Disable User Trainee-03', 'disable-user', 'trainee-03'],
    ['isolate\thost lab-02', 'isolate-host', 'lab-02'],
  ])('accepts %j', (input, verb, target) => {
    const parsed = parseCommand(input)
    expect(parsed).toMatchObject({ ok: true, verb, target })
    expect(parsed.normalized).toBe(`${verb.replace('-', ' ')} ${target}`)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['rm -rf /', 'unknown-command'],
    ['block 192.0.2.10', 'unknown-command'],
    ['shutdown host lab-02', 'unknown-command'],
    ['block ip', 'missing-target'],
    ['block ip 192.0.2.10 now', 'extra-arguments'],
    ['block ip 192.0.2.256', 'invalid-ip'],
    ['block ip 192.0.2', 'invalid-ip'],
    ['block ip 192.0.02.1', 'invalid-ip'],
    ['block ip lab-02', 'invalid-ip'],
    ['disable user trainee_03', 'invalid-name'],
    ['isolate host -lab', 'invalid-name'],
    ['isolate host 192.0.2.10;ls', 'invalid-name'],
    [`block ip ${'1'.repeat(130)}`, 'too-long'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseCommand(input)).toEqual({ ok: false, reason })
    expect(SYNTAX_HINTS[reason]).toBeTruthy()
  })

  it('rejects non-string input', () => {
    expect(parseCommand(undefined)).toEqual({ ok: false, reason: 'empty' })
  })

  it('validates dotted ipv4 octets', () => {
    expect(isIpv4('0.0.0.0')).toBe(true)
    expect(isIpv4('255.255.255.255')).toBe(true)
    expect(isIpv4('1.2.3.4.5')).toBe(false)
    expect(isIpv4('01.2.3.4')).toBe(false)
  })

  it.each([
    ['logs kiosk-04', 'logs', 'kiosk-04'],
    ['  LOGS   Kiosk-04 ', 'logs', 'kiosk-04'],
    ['whois 203.0.113.45', 'whois', '203.0.113.45'],
    ['WHOIS 10.20.0.1', 'whois', '10.20.0.1'],
  ])('accepts the lookup %j', (input, verb, target) => {
    expect(parseCommand(input)).toEqual({
      ok: true,
      kind: 'lookup',
      verb,
      target,
      normalized: `${verb} ${target}`,
    })
  })

  it('accepts dismiss with no target', () => {
    expect(parseCommand('  Dismiss ')).toEqual({
      ok: true,
      kind: 'dismiss',
      verb: 'dismiss',
      target: null,
      normalized: 'dismiss',
    })
    expect(formatCommand('dismiss', null)).toBe('dismiss')
  })

  it.each([
    ['dismiss now', 'extra-arguments'],
    ['logs', 'missing-target'],
    ['whois', 'missing-target'],
    ['logs a b', 'extra-arguments'],
    ['whois 203.0.113.256', 'invalid-ip'],
    ['whois kiosk-04', 'invalid-ip'],
    ['logs 203.0.113.45', 'invalid-name'],
    ['logs ../etc/passwd', 'invalid-name'],
    ['logs host; rm -rf /', 'extra-arguments'],
  ])('rejects the lookup or dismiss input %j with %s', (input, reason) => {
    expect(parseCommand(input)).toEqual({ ok: false, reason })
    expect(SYNTAX_HINTS[reason]).toBeTruthy()
  })

  it('marks containment commands as actions', () => {
    expect(parseCommand('block ip 192.0.2.10')).toMatchObject({ ok: true, kind: 'action' })
  })
})
