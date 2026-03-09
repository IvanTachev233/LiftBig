import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkoutLoggerPage } from './workout-logger.page';

describe('WorkoutLoggerPage', () => {
  let component: WorkoutLoggerPage;
  let fixture: ComponentFixture<WorkoutLoggerPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WorkoutLoggerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
