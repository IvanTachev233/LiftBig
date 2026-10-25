import { TestBed } from '@angular/core/testing';
import { WeightUnitService } from './weight-unit.service';

describe('WeightUnitService', () => {
  let units: WeightUnitService;

  beforeEach(() => {
    units = TestBed.inject(WeightUnitService);
  });

  it('starts in kg', () => {
    expect(units.unit()).toBe('kg');
  });

  it('formats kg as stored and pounds rounded to 0.1 without a trailing .0', () => {
    expect(units.format(100)).toBe('100 kg');
    expect(units.format(102.5)).toBe('102.5 kg');
    expect(units.format(null)).toBe('—');
    units.setUnit('lb');
    expect(units.format(100)).toBe('220.5 lb');
    expect(units.format(102.06)).toBe('225 lb');
    expect(units.format(0)).toBe('0 lb');
  });

  it('passes kg inputs through unchanged', () => {
    expect(units.toInput(102.25)).toBe(102.25);
    expect(units.toKg(102.25)).toBe(102.25);
    expect(units.toKg(null)).toBeNull();
  });

  it('converts pound inputs to kg with 2 decimals and back', () => {
    units.setUnit('lb');
    expect(units.toKg(225)).toBe(102.06);
    expect(units.toInput(102.06)).toBe(225);
    expect(units.toKg('' as unknown as number)).toBeNull();
  });
});
