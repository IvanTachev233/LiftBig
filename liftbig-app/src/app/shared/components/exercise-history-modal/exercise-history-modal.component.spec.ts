import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../../environments/environment';
import { ExerciseHistoryComponent } from '../exercise-history/exercise-history.component';
import { BottomSheetService } from '../../ui/bottom-sheet.service';
import { ExerciseHistoryModalComponent } from './exercise-history-modal.component';

describe('ExerciseHistoryModalComponent', () => {
  let fixture: ComponentFixture<ExerciseHistoryModalComponent>;
  let http: HttpTestingController;
  let modalCtrl: jasmine.SpyObj<ModalController>;

  beforeEach(() => {
    modalCtrl = jasmine.createSpyObj('ModalController', ['dismiss']);
    TestBed.configureTestingModule({
      imports: [ExerciseHistoryModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BottomSheetService, useValue: jasmine.createSpyObj('BottomSheetService', ['open']) },
      ],
    });
    TestBed.overrideComponent(ExerciseHistoryModalComponent, {
      add: { providers: [{ provide: ModalController, useValue: modalCtrl }] },
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ExerciseHistoryModalComponent);
    fixture.componentInstance.exerciseId = 'squat';
    fixture.componentInstance.exerciseName = 'Back Squat';
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/lifts/squat/history`).flush({
      exerciseId: 'squat',
      best: null,
      latest: [],
      entries: [],
    });
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it("shows the exercise name and that exercise's history", () => {
    expect(fixture.nativeElement.querySelector('ion-title').textContent.trim()).toBe('Back Squat');
    const history = fixture.debugElement.query((de) => de.componentInstance instanceof ExerciseHistoryComponent);
    expect((history.componentInstance as ExerciseHistoryComponent).exerciseId).toBe('squat');
  });

  it('"+" opens the add entry sheet of the history', () => {
    const history = fixture.debugElement.query((de) => de.componentInstance instanceof ExerciseHistoryComponent)
      .componentInstance as ExerciseHistoryComponent;
    const add = spyOn(history, 'openAddEntry').and.resolveTo();
    fixture.nativeElement.querySelector('.add-entry-btn').click();
    expect(add).toHaveBeenCalled();
  });

  it('Close dismisses the modal', () => {
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(modalCtrl.dismiss).toHaveBeenCalled();
  });
});
