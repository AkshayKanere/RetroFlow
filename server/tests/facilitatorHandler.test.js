import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateFacilitatorPassword, verifyFacilitatorToken } from '../handlers/facilitatorHandler.js';

describe('facilitatorHandler', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, FACILITATOR_PASSWORD: 'secret123' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should return token for correct password', () => {
    const result = validateFacilitatorPassword('secret123');
    expect(result.token).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should return error for wrong password', () => {
    const result = validateFacilitatorPassword('wrong');
    expect(result.error).toBe('Invalid password');
    expect(result.token).toBeUndefined();
  });

  it('should return error if no password configured', () => {
    delete process.env.FACILITATOR_PASSWORD;
    const result = validateFacilitatorPassword('anything');
    expect(result.error).toBe('Facilitator login not configured');
  });

  it('should verify a valid token', () => {
    const { token } = validateFacilitatorPassword('secret123');
    expect(verifyFacilitatorToken(token)).toBe(true);
  });

  it('should reject an invalid token', () => {
    expect(verifyFacilitatorToken('bogus')).toBe(false);
  });
});
