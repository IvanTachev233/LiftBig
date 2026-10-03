import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { ExerciseDetailModalComponent } from './exercise-detail-modal.component';
import { Exercise } from '../../../core/workout.service';

describe('ExerciseDetailModalComponent', () => {
  let fixture: ComponentFixture<ExerciseDetailModalComponent>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  const base: Exercise = {
    id: 'e1',
    name: 'Back Squat',
    description: 'Bar on the upper back, squat below parallel.',
    videoUrl: null,
  };

  beforeEach(async () => {
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['dismiss']);
    modalCtrlSpy.dismiss.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [ExerciseDetailModalComponent],
      providers: [{ provide: ModalController, useValue: modalCtrlSpy }],
    })
      // IonicModule provides its own ModalController to standalone components,
      // so the spy has to be provided on the component itself
      .overrideComponent(ExerciseDetailModalComponent, {
        add: { providers: [{ provide: ModalController, useValue: modalCtrlSpy }] },
      })
      .compileComponents();
  });

  function render(exercise: Exercise): HTMLElement {
    fixture = TestBed.createComponent(ExerciseDetailModalComponent);
    fixture.componentInstance.exercise = exercise;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the name large and the description smaller', () => {
    const el = render(base);
    const name = el.querySelector('.exercise-name') as HTMLElement;
    const description = el.querySelector('.exercise-description') as HTMLElement;

    expect(name.tagName).toBe('H1');
    expect(name.textContent).toContain('Back Squat');
    expect(description.tagName).toBe('P');
    expect(description.textContent).toContain('squat below parallel');
  });

  it('renders no description element when the description is empty', () => {
    for (const description of [undefined, null, '', '   ']) {
      const el = render({ ...base, description });
      expect(el.querySelector('.exercise-description'))
        .withContext(String(description))
        .toBeNull();
    }
  });

  it('renders no video section without a videoUrl', () => {
    for (const videoUrl of [undefined, null, '']) {
      const el = render({ ...base, videoUrl });
      expect(el.querySelector('.exercise-video')).withContext(String(videoUrl)).toBeNull();
    }
  });

  it('renders no video section for a non-https videoUrl', () => {
    const el = render({ ...base, videoUrl: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(el.querySelector('.exercise-video')).toBeNull();
  });

  it('embeds youtube.com/watch?v=ID with exactly the built embed URL', () => {
    const el = render({ ...base, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s' });
    const iframe = el.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(iframe.getAttribute('title')).toBe('Video for Back Squat');
  });

  it('embeds youtu.be/ID with exactly the built embed URL', () => {
    const el = render({ ...base, videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=tracking' });
    const iframe = el.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('embeds vimeo.com/ID with exactly the built player URL', () => {
    const el = render({ ...base, videoUrl: 'https://vimeo.com/76979871' });
    const iframe = el.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://player.vimeo.com/video/76979871');
  });

  it('shows only an "Open video" link for any other https URL', () => {
    const el = render({ ...base, videoUrl: 'https://evil.example/x' });
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('video')).toBeNull();
    const link = el.querySelector('a.video-link') as HTMLAnchorElement;
    expect(link.textContent).toContain('Open video');
    expect(link.getAttribute('href')).toBe('https://evil.example/x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('plays a direct .mp4 file in a <video controls playsinline>', () => {
    const el = render({ ...base, videoUrl: 'https://cdn.example.com/squat.mp4' });
    const video = el.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.hasAttribute('controls')).toBeTrue();
    expect(video.hasAttribute('playsinline')).toBeTrue();
    expect(video.getAttribute('src')).toBe('https://cdn.example.com/squat.mp4');
    expect(el.querySelector('iframe')).toBeNull();
  });

  it('close dismisses with the cancel role', () => {
    render(base);
    fixture.componentInstance.close();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'cancel');
  });
});
