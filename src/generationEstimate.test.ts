import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateFromFormState,
  estimateGenerationMinutes,
  formatEstimateLabel,
  formatRemainingLabel,
} from './generationEstimate';

describe('estimateGenerationMinutes', () => {
  const cases: Array<{
    durationMinutes: 3 | 5 | 10 | 15;
    expected: number;
  }> = [
    { durationMinutes: 3, expected: 8 },
    { durationMinutes: 5, expected: 10 },
    { durationMinutes: 10, expected: 16 },
    { durationMinutes: 15, expected: 22 },
  ];

  for (const { durationMinutes, expected } of cases) {
    it(`estimates ${durationMinutes}-minute show at ~${expected} minutes`, () => {
      assert.equal(
        estimateGenerationMinutes({
          durationMinutes,
          guestCount: 1,
          ambientBeds: false,
          musicEnabled: true,
        }),
        expected
      );
    });
  }

  it('adds time for extra guests', () => {
    assert.equal(
      estimateGenerationMinutes({ durationMinutes: 5, guestCount: 3, ambientBeds: false }),
      11
    );
  });

  it('adds time for heavy features', () => {
    assert.equal(
      estimateGenerationMinutes({
        durationMinutes: 5,
        guestCount: 1,
        features: { phoneConnectSfx: true, topicStingers: true },
        ambientBeds: false,
      }),
      11
    );
  });

  it('subtracts time when music is disabled', () => {
    assert.equal(
      estimateGenerationMinutes({
        durationMinutes: 5,
        guestCount: 1,
        ambientBeds: false,
        musicEnabled: false,
      }),
      10
    );
  });
});

describe('formatEstimateLabel', () => {
  it('formats singular and plural labels', () => {
    assert.equal(formatEstimateLabel(1), '~1 min');
    assert.equal(formatEstimateLabel(10), '~10 mins');
  });
});

describe('formatRemainingLabel', () => {
  it('formats minutes and seconds remaining', () => {
    assert.equal(formatRemainingLabel(6 * 60 * 1000), '~6m left');
    assert.equal(formatRemainingLabel(45 * 1000), '~45s left');
  });
});

describe('estimateFromFormState', () => {
  it('uses default guest count when overrides omit guests', () => {
    assert.equal(
      estimateFromFormState({ durationMinutes: 3, defaultGuestCount: 2 }),
      9
    );
  });
});
