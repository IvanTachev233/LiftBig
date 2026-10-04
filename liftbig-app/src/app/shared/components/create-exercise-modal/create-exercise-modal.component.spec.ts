import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController, ToastController } from '@ionic/angular';
import { defineCustomElements } from '@ionic/core/loader';
import { CreateExerciseModalComponent } from './create-exercise-modal.component';
import { Exercise } from '../../../core/workout.service';
import { environment } from '../../../../environments/environment';

describe('CreateExerciseModalComponent', () => {
  let component: CreateExerciseModalComponent;
  let fixture: ComponentFixture<CreateExerciseModalComponent>;
  let httpMock: HttpTestingController;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;

  const url = `${environment.apiUrl}/workouts/exercises`;

  function saveButton(): HTMLIonButtonElement {
    return fixture.nativeElement.querySelector('.save-button');
  }

  function render() {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  // Lets the subscribe callbacks (and their awaited toast calls) settle
  function settle(condition: () => boolean, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (condition()) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('settle: timed out'));
        setTimeout(check, 10);
      };
      check();
    });
  }

  beforeEach(async () => {
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);
    modalCtrlSpy.dismiss.and.resolveTo(true);
    toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    await TestBed.configureTestingModule({
      imports: [CreateExerciseModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ModalController, useValue: modalCtrlSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    })
      // IonicModule provides its own ModalController to standalone components,
      // so the spy has to be provided on the component itself
      .overrideComponent(CreateExerciseModalComponent, {
        add: { providers: [{ provide: ModalController, useValue: modalCtrlSpy }] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CreateExerciseModalComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    render();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('disables Save while the name is blank or whitespace', () => {
    expect(saveButton().disabled).toBeTrue();

    component.name = '   ';
    render();
    expect(saveButton().disabled).toBeTrue();

    component.name = 'Front Squat';
    render();
    expect(saveButton().disabled).toBeFalse();
  });

  it('does not send a request when save() is called with a blank name', () => {
    component.name = '  ';
    component.save();
    httpMock.expectNone(url);
  });

  it('POSTs a trimmed body and dismisses with the created exercise on 201', () => {
    component.name = '  Zercher Squat  ';
    component.description = '  Bar in the elbows  ';
    component.videoUrl = '  https://youtu.be/dQw4w9WgXcQ ';

    component.save();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Zercher Squat',
      description: 'Bar in the elbows',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const created: Exercise = {
      id: 'new-1',
      name: 'Zercher Squat',
      description: 'Bar in the elbows',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      createdById: 'coach-1',
    };
    req.flush(created, { status: 201, statusText: 'Created' });

    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(created, 'confirm');
  });

  it('omits empty description and video URL from the body', () => {
    component.name = 'Deadlift Variation';
    component.description = '   ';
    component.videoUrl = '';

    component.save();

    const req = httpMock.expectOne(url);
    expect(req.request.body).toEqual({ name: 'Deadlift Variation' });
    req.flush({ id: 'x', name: 'Deadlift Variation' }, { status: 201, statusText: 'Created' });
  });

  it('shows a field error and sends no request for an invalid (non-https) video URL', () => {
    for (const bad of ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'not a url']) {
      component.name = 'Front Squat';
      component.videoUrl = bad;

      component.save();
      const el = render();

      httpMock.expectNone(url);
      const error = el.querySelector('.video-url-error') as HTMLElement;
      expect(error).withContext(bad).toBeTruthy();
      expect(error.textContent).toContain('https://');
    }
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });

  it('on 409 shows the inline duplicate-name message and keeps the modal open', () => {
    component.name = 'Squat';
    component.save();

    httpMock
      .expectOne(url)
      .flush({ message: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    const el = render();

    const error = el.querySelector('.name-error') as HTMLElement;
    expect(error.textContent).toContain('An exercise with this name already exists');
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBeFalse();
  });

  it('shows a toast on other errors and keeps the modal open', async () => {
    component.name = 'Squat';
    component.save();

    httpMock.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(() => toastSpy.present.calls.count() > 0);

    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.name-error')).toBeNull();
  });

  it('ignores a second Save while the first request is pending', () => {
    component.name = 'Squat';
    component.save();
    component.save();

    const reqs = httpMock.match(url);
    expect(reqs.length).toBe(1);
    reqs[0].flush({ id: 'x', name: 'Squat' }, { status: 201, statusText: 'Created' });
  });

  it('submitting the form (Enter in a field) calls save() once', () => {
    const saveSpy = spyOn(component, 'save').and.callThrough();
    component.name = 'Squat';
    const el = render();

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    httpMock
      .expectOne(url)
      .flush({ id: 'x', name: 'Squat' }, { status: 201, statusText: 'Created' });
  });

  it('one tap on Save submits the form, calling save() once', async () => {
    // Ionic components are lazy-loaded and only defined once some spec has run
    // IonicModule.forRoot(); define them here (a no-op if already defined) so
    // the click goes through ion-button's hidden native submit button
    defineCustomElements(window);
    await customElements.whenDefined('ion-button');

    const saveSpy = spyOn(component, 'save').and.callThrough();
    component.name = 'Squat';
    const el = render();
    const button = saveButton();
    await button.componentOnReady();

    expect(button.type).toBe('submit');
    expect(button.form).toBe(el.querySelector('form')!);

    button.click();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    httpMock
      .expectOne(url)
      .flush({ id: 'x', name: 'Squat' }, { status: 201, statusText: 'Created' });
  });

  it('cancel dismisses with nothing and the cancel role', () => {
    component.cancel();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
