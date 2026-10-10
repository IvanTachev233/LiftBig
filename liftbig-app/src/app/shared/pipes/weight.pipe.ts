import { Pipe, PipeTransform, inject } from '@angular/core';
import { WeightUnitService } from '../../core/weight-unit.service';

// A kg value in the user's unit, e.g. "220.5 lb". Impure so it follows a
// unit change.
@Pipe({ name: 'weight', standalone: true, pure: false })
export class WeightPipe implements PipeTransform {
  private units = inject(WeightUnitService);

  transform(kg: number | null | undefined): string {
    return this.units.format(kg);
  }
}
