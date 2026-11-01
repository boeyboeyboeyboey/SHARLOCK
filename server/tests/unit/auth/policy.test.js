import { describe, expect, it } from 'vitest'
import {
  parseEmptyInput,
  parseEmptyQuery,
  parseLoginInput,
  parseRegistrationInput,
} from '../../../src/modules/auth/policy.js'

const validRegistration = {
  email: '  Learner+One@example.test  ',
  username: ' Case_Name-1 ',
  password: 'Correct-Horse-🔒-2026',
  avatarId: 'mint',
}

function registrationPasswordError(password) {
  try {
    parseRegistrationInput({ ...validRegistration, password })
  } catch (error) {
    return error.fieldErrors?.password
  }
  return undefined
}

describe('auth request policy', () => {
  it('normalizes only the email and username fields', () => {
    const parsed = parseRegistrationInput(validRegistration)
    expect(parsed).toEqual({
      emailNormalized: 'learner+one@example.test',
      username: { display: 'Case_Name-1', normalized: 'case_name-1' },
      password: validRegistration.password,
      avatarId: 'mint',
    })
  })

  it('preserves well-formed password text and counts Unicode code points', () => {
    const password = 'Alpha Bravo1!'
    expect([...password]).toHaveLength(13)
    expect(parseRegistrationInput({ ...validRegistration, password }).password).toBe(password)
    expect(
      parseLoginInput({ email: 'learner@example.test', password: 'AlphaBravo1!' }).password,
    ).toBe('AlphaBravo1!')
    expect(() =>
      parseLoginInput({ email: 'learner@example.test', password: 'a'.repeat(129) }),
    ).toThrow()
    expect(() =>
      parseLoginInput({ email: 'learner@example.test', password: `${'a'.repeat(14)}\ud800` }),
    ).toThrow()
  })

  it('requires a 12-code-point minimum, Unicode uppercase, and punctuation or symbols for registration', () => {
    expect([...'AlphaBravo1!']).toHaveLength(12)
    expect(
      parseRegistrationInput({ ...validRegistration, password: 'AlphaBravo1!' }).password,
    ).toBe('AlphaBravo1!')
    expect(
      parseRegistrationInput({ ...validRegistration, password: 'ABCDEFGHIJ!!' }).password,
    ).toBe('ABCDEFGHIJ!!')
    expect(registrationPasswordError('AlphaBravo!')).toMatch(/at least 12 characters/)
    expect(registrationPasswordError('AlphaBravo!')).not.toMatch(/128/)
    expect(registrationPasswordError(`A${'a'.repeat(127)}!`)).toBe('That password is too long.')
    expect(registrationPasswordError('alphabravo1!')).toMatch(/uppercase letter/)
    expect(registrationPasswordError('AlphaBravo12')).toMatch(/punctuation or symbol/)
    expect(registrationPasswordError('AlphaBravo1 ')).toMatch(/punctuation or symbol/)
    expect(registrationPasswordError('AlphaBravo1\u0301')).toMatch(/punctuation or symbol/)
    expect(
      parseRegistrationInput({ ...validRegistration, password: 'Äbcdefghij🔒1' }).password,
    ).toBe('Äbcdefghij🔒1')
  })

  it('asks only for a password at sign-in and never states a length rule there', () => {
    const passwordError = (password) => {
      try {
        parseLoginInput({ identifier: 'learner@example.test', password })
      } catch (error) {
        return error.fieldErrors.password
      }
      return null
    }
    expect(passwordError('')).toBe('Enter your password.')
    expect(passwordError(undefined)).toBe('Enter your password.')
    expect(passwordError('short')).toBeNull()
    expect(passwordError('a'.repeat(128))).toBeNull()
    expect(passwordError('a'.repeat(129))).toBe('Enter your password.')
  })

  it('allows legacy composition-free passwords to pass login validation', () => {
    const legacyPassword = 'lowercaseonly12345'
    expect([...legacyPassword]).toHaveLength(18)
    expect(
      parseLoginInput({ email: 'learner@example.test', password: legacyPassword }).password,
    ).toBe(legacyPassword)
    expect(registrationPasswordError(legacyPassword)).toMatch(/uppercase letter/)
  })

  it.each([
    'learner@',
    'learner@@example.test',
    'learner..name@example.test',
    'learner@-example.test',
    'learner@exam_ple.test',
    'learner@éxample.test',
  ])('rejects a malformed or non-ASCII email: %s', (email) => {
    expect(() => parseLoginInput({ email, password: 'correct-horse-battery' })).toThrow()
  })

  it('normalizes an email identifier and the legacy email key', () => {
    const password = 'correct-horse-battery'
    const expected = { kind: 'email', normalized: 'learner@example.test' }
    expect(parseLoginInput({ identifier: '  Learner@Example.TEST ', password }).identifier).toEqual(
      expected,
    )
    expect(parseLoginInput({ email: ' Learner@Example.test ', password }).identifier).toEqual(
      expected,
    )
  })

  it('lowercases a username identifier', () => {
    const parsed = parseLoginInput({
      identifier: ' Detective_01 ',
      password: 'correct-horse-battery',
    })
    expect(parsed.identifier).toEqual({ kind: 'username', normalized: 'detective_01' })
  })

  it('rejects both identifier keys and unknown extra keys', () => {
    const password = 'correct-horse-battery'
    expect(() =>
      parseLoginInput({
        identifier: 'learner@example.test',
        email: 'learner@example.test',
        password,
      }),
    ).toThrow(/highlighted fields/)
    try {
      parseLoginInput({ identifier: 'learner', password, role: 'admin' })
      throw new Error('Expected strict field validation to fail.')
    } catch (error) {
      expect(error.fieldErrors.role).toBe('This field is not allowed.')
    }
  })

  it.each(['a@', 'two@@example.test', 'ab', 'has space', 'a'.repeat(33), ''])(
    'reports an identifier field error for: %s',
    (identifier) => {
      try {
        parseLoginInput({ identifier, password: 'correct-horse-battery' })
        throw new Error('Expected identifier validation to fail.')
      } catch (error) {
        expect(error.code).toBe('VALIDATION_ERROR')
        expect(error.fieldErrors.identifier).toBe('Enter your email address or username.')
      }
    },
  )

  it('rejects unknown, role, prototype and Mongo operator fields with safe errors', () => {
    const payload = JSON.parse(
      '{"email":"learner@example.test","password":"correct-horse-battery","role":"admin","$where":"x","__proto__":{"polluted":true}}',
    )
    try {
      parseLoginInput(payload)
      throw new Error('Expected strict field validation to fail.')
    } catch (error) {
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(Object.getPrototypeOf(error.fieldErrors)).toBe(null)
      expect(error.fieldErrors.role).toBe('This field is not allowed.')
      expect(error.fieldErrors.$where).toBe('This field is not allowed.')
      expect(Object.hasOwn(error.fieldErrors, '__proto__')).toBe(true)
      expect(error.fieldErrors.__proto__).toBe('This field is not allowed.')
      expect({}.polluted).toBeUndefined()
    }
  })

  it('requires own properties instead of inherited request values', () => {
    const body = Object.create({ email: 'learner@example.test' })
    body.password = 'correct-horse-battery'
    expect(() => parseLoginInput(body)).toThrow(/highlighted fields/)
  })

  it('rejects malformed input types, avatar IDs and out-of-contract logout fields', () => {
    expect(() => parseRegistrationInput([])).toThrow()
    expect(() => parseRegistrationInput({ ...validRegistration, avatarId: 'admin' })).toThrow()
    expect(() => parseRegistrationInput({ ...validRegistration, username: 'ab' })).toThrow()
    expect(() => parseEmptyInput({ role: 'student' })).toThrow()
    expect(() => parseEmptyInput({})).not.toThrow()
    expect(() => parseEmptyInput(undefined)).not.toThrow()
  })

  it('accepts 32-character usernames and rejects 33-character usernames', () => {
    const maximumUsername = 'a'.repeat(32)
    expect(
      parseRegistrationInput({ ...validRegistration, username: maximumUsername }).username.display,
    ).toBe(maximumUsername)
    try {
      parseRegistrationInput({ ...validRegistration, username: `${maximumUsername}a` })
      throw new Error('Expected the 33-character username to fail.')
    } catch (error) {
      expect(error.fieldErrors?.username).toMatch(/3 to 32 letters/)
    }
  })

  it('rejects all query fields and operator-style query keys', () => {
    expect(() => parseEmptyQuery({ page: '1' })).toThrow()
    expect(() => parseEmptyQuery({ $ne: 'x' })).toThrow()
    expect(() => parseEmptyQuery({})).not.toThrow()
  })
})
