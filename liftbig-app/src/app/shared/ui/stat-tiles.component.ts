import { Component, input } from '@angular/core';

export interface StatTile {
  label: string;
  value: string | number;
  unit?: string;
}

/** Two-column tiles: label over a large number and its unit */
@Component({
  selector: 'app-stat-tiles',
  templateUrl: './stat-tiles.component.html',
  styleUrls: ['./stat-tiles.component.scss'],
  standalone: true,
})
export class StatTilesComponent {
  readonly tiles = input.required<StatTile[]>();
}
