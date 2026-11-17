import { describe, expect, it } from 'vitest';
import { pairNamesOf, roleName } from './pairNames';

describe('roleName', () => {
  it('puts the pupil’s Short Name with their role', () => {
    expect(roleName('apple', { apple: 'Amos', banana: 'Joseph' })).toBe('Apple (Amos)');
    expect(roleName('banana', { apple: 'Amos', banana: 'Joseph' })).toBe('Banana (Joseph)');
  });

  it('is just the role for a pair checked in without names', () => {
    expect(roleName('apple', {})).toBe('Apple');
    expect(roleName('banana', { banana: '  ' })).toBe('Banana');
  });
});

describe('pairNamesOf', () => {
  it('takes the Short Names the pair checked in with', () => {
    const session = { students: { apple: { id: 'a', shortName: 'Amos' }, banana: { id: 'j', shortName: 'Joseph' } } };
    expect(pairNamesOf(session)).toEqual({ apple: 'Amos', banana: 'Joseph' });
  });

  it('has no names for a pair checked in by number, or no pair', () => {
    expect(pairNamesOf({})).toEqual({});
    expect(pairNamesOf(null)).toEqual({});
  });
});
