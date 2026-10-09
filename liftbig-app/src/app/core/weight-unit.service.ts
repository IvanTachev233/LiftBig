import { Injectable, signal } from '@angular/core';

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

// The signed-in user's weight unit. The API stores and sends kg; this
// converts at display and input.
@Injectable({ providedIn: 'root' })
export class WeightUnitService {
  readonly unit = signal<WeightUnit>('kg');

  setUnit(unit: WeightUnit) {
    this.unit.set(unit);
  }

  /** kg in the user's unit, rounded to 0.1 */
  toDisplay(kg: number): number {
    const value = this.unit() === 'lb' ? kg / KG_PER_LB : kg;
    return Math.round(value * 10) / 10;
  }

  /** e.g. "100 kg" or "220.5 lb"; no weight gives "—" */
  format(kg: number | null | undefined): string {
    if (kg === null || kg === undefined) return '—';
    return `${this.toDisplay(kg)} ${this.unit()}`;
  }

  /** A stored kg value for an input in the user's unit; kg stays as stored */
  toInput(kg: number | null): number | null {
    if (kg === null || kg === undefined) return null;
    return this.unit() === 'kg' ? kg : this.toDisplay(kg);
  }

  /** An input in the user's unit as kg; kg passes through, pounds get 2 decimals */
  toKg(value: number | null): number | null {
    if (value === null || value === undefined || (value as unknown) === '') {
      return null;
    }
    if (this.unit() === 'kg') return value;
    return Math.round(Number(value) * KG_PER_LB * 100) / 100;
  }
}
