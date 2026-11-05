import { TestBed } from '@angular/core/testing';
import { isStorableWeight, weightInputError } from './server-limits';
import { WeightUnitService } from './weight-unit.service';

describe('weightInputError', () => {
  let units: WeightUnitService;

  beforeEach(() => {
    units = TestBed.inject(WeightUnitService);
  });

  it('says nothing about an empty field or a weight the API stores', () => {
    for (const value of [null, '', 100, 9999.99, 0.01]) {
      expect(weightInputError(value, units))
        .withContext(String(value))
        .toBe('');
    }
  });

  it('refuses kg past the numeric(6,2) column', () => {
    expect(weightInputError(10000, units)).toBe('At most 9999.99 kg');
    expect(weightInputError(9999.991, units)).toBe('At most 9999.99 kg');
  });

  it('refuses weights under 0.01 kg, which the API would store as 0 kg', () => {
    for (const value of [0, -5, 0.004, 0.005, 0.009]) {
      expect(weightInputError(value, units))
        .withContext(String(value))
        .toBe('At least 0.01 kg');
    }
  });

  it('gives the limits in pounds for a pound user', () => {
    units.setUnit('lb');
    expect(weightInputError(22046.2, units)).toBe('');
    expect(weightInputError(22046.3, units)).toBe('At most 22046.2 lb');
    expect(weightInputError(0.02, units)).toBe('');
    expect(weightInputError(0.01, units)).toBe('At least 0.02 lb');
  });

  it('takes the string an ion-input can hold', () => {
    expect(weightInputError('10000', units)).toBe('At most 9999.99 kg');
    expect(weightInputError('102.5', units)).toBe('');
  });
});

describe('isStorableWeight', () => {
  it('needs a weight and no limit error', () => {
    const units = TestBed.inject(WeightUnitService);
    expect(isStorableWeight(null, units)).toBeFalse();
    expect(isStorableWeight('', units)).toBeFalse();
    expect(isStorableWeight(0, units)).toBeFalse();
    expect(isStorableWeight(10000, units)).toBeFalse();
    expect(isStorableWeight(140, units)).toBeTrue();
  });
});
