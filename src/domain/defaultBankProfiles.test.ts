import { describe, expect, it } from 'vitest';
import { DEFAULT_BANK_PROFILES } from './defaultBankProfiles';
import { bankProfileSchema } from './validation';

describe('DEFAULT_BANK_PROFILES', () => {
  it('contains profiles accepted by the persisted schema', () => {
    expect(DEFAULT_BANK_PROFILES).toHaveLength(4);

    for (const profile of DEFAULT_BANK_PROFILES) {
      const parsed = bankProfileSchema.safeParse(profile);
      expect(parsed.success).toBe(true);
    }
  });

  it('uses unique ids and names', () => {
    const ids = new Set(DEFAULT_BANK_PROFILES.map((profile) => profile.id));
    const names = new Set(DEFAULT_BANK_PROFILES.map((profile) => profile.name));

    expect(ids.size).toBe(DEFAULT_BANK_PROFILES.length);
    expect(names.size).toBe(DEFAULT_BANK_PROFILES.length);
  });
});
