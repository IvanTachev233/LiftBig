import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WorkoutLoggerPage } from './workout-logger.page';

describe('WorkoutLoggerPage', () => {
  let component: WorkoutLoggerPage;
  let fixture: ComponentFixture<WorkoutLoggerPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkoutLoggerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(WorkoutLoggerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
