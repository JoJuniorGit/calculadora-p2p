/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BANK_PROFILES } from '../domain/defaultBankProfiles';
import { useAppStore } from './useAppStore';

describe('fresh app store', () => {
  it('starts with the bundled default bank profiles', () => {
    expect(useAppStore.getState().profiles).toEqual(DEFAULT_BANK_PROFILES);
  });
});
