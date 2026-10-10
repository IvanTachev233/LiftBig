import { TestBed } from '@angular/core/testing';
import { WeightUnitService } from '../../core/weight-unit.service';
import { WeightPipe } from './weight.pipe';

describe('WeightPipe', () => {
  let pipe: WeightPipe;
  let units: WeightUnitService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WeightPipe] });
    pipe = TestBed.inject(WeightPipe);
    units = TestBed.inject(WeightUnitService);
  });

  it('shows 100 kg as "100 kg" for kg users', () => {
    expect(pipe.transform(100)).toBe('100 kg');
  });

  it('shows 100 kg as "220.5 lb" for lb users', () => {
    units.setUnit('lb');
    expect(pipe.transform(100)).toBe('220.5 lb');
  });

  it('shows a dash without a weight', () => {
    expect(pipe.transform(null)).toBe('—');
  });
});
