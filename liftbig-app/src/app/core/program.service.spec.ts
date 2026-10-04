import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  AddProgramSetRequest,
  CreateProgramRequest,
  Program,
  ProgramService,
  ProgramSet,
  UpdateProgramRequest,
  UpdateProgramSetRequest,
} from './program.service';
import { environment } from '../../environments/environment';

describe('ProgramService', () => {
  let service: ProgramService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/programs`;

  const program: Program = {
    id: 'p1',
    clientId: 'c1',
    coachId: 'k1',
    name: 'Week 1',
    scheduledDate: '2026-10-05',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    exercises: [
      {
        id: 'card-1',
        programId: 'p1',
        exerciseId: 'e1',
        exercise: { id: 'e1', name: 'Squat' },
        order: 1,
        supersetGroup: null,
        sets: [
          { id: 's1', programExerciseId: 'card-1', reps: 5, weight: 100, notes: null, order: 1, made: true },
          { id: 's2', programExerciseId: 'card-1', reps: 5, weight: 100, notes: 'slow', order: 2, made: null },
        ],
      },
      {
        id: 'card-2',
        programId: 'p1',
        exerciseId: 'e1',
        exercise: { id: 'e1', name: 'Squat' },
        order: 2,
        supersetGroup: null,
        sets: [{ id: 's3', programExerciseId: 'card-2', reps: 3, weight: null, notes: null, order: 1, made: null }],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProgramService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('createProgram', () => {
    it('sends a POST request to /programs with the nested cards body', () => {
      const body: CreateProgramRequest = {
        clientId: 'c1',
        name: 'Week 1',
        scheduledDate: '2026-10-05',
        exercises: [
          {
            exerciseId: 'e1',
            order: 1,
            supersetGroup: null,
            sets: [
              { reps: 5, weight: 100, notes: null, order: 1 },
              { reps: 5, weight: 100, notes: 'slow', order: 2 },
            ],
          },
          { exerciseId: 'e1', order: 2, sets: [{ reps: 3, order: 1 }] },
        ],
      };
      let result: Program | undefined;

      service.createProgram(body).subscribe((p) => (result = p));

      const req = httpMock.expectOne({ method: 'POST', url: base });
      expect(req.request.body).toEqual(body);
      req.flush(program, { status: 201, statusText: 'Created' });

      expect(result).toEqual(program);
    });
  });

  describe('updateProgram', () => {
    it('sends a PUT request to /programs/:id keeping card and set ids', () => {
      const body: UpdateProgramRequest = {
        name: 'Week 1b',
        exercises: [
          {
            id: 'card-1',
            exerciseId: 'e1',
            order: 1,
            supersetGroup: null,
            sets: [
              { id: 's1', reps: 5, weight: 105, notes: null, order: 1 },
              { reps: 5, weight: 105, order: 2 },
            ],
          },
        ],
      };
      let result: Program | undefined;

      service.updateProgram('p1', body).subscribe((p) => (result = p));

      const req = httpMock.expectOne({ method: 'PUT', url: `${base}/p1` });
      expect(req.request.body).toEqual(body);
      req.flush(program);

      expect(result).toEqual(program);
      expect(result?.exercises[0].sets[0].made).toBeTrue();
    });
  });

  describe('addSet', () => {
    it('sends a POST request to /programs/:id/exercises/:cardId/sets', () => {
      const body: AddProgramSetRequest = { reps: 5, weight: 100, notes: null, made: true };
      const created: ProgramSet = {
        id: 's9',
        programExerciseId: 'card-2',
        reps: 5,
        weight: 100,
        notes: null,
        order: 2,
        made: true,
      };
      let result: ProgramSet | undefined;

      service.addSet('p1', 'card-2', body).subscribe((s) => (result = s));

      const req = httpMock.expectOne({ method: 'POST', url: `${base}/p1/exercises/card-2/sets` });
      expect(req.request.body).toEqual(body);
      req.flush(created, { status: 201, statusText: 'Created' });

      expect(result).toEqual(created);
    });
  });

  describe('updateSet', () => {
    it('sends a PATCH request to /programs/:id/sets/:setId', () => {
      const body: UpdateProgramSetRequest = { made: false };
      const updated: ProgramSet = { ...program.exercises[0].sets[1], made: false };
      let result: ProgramSet | undefined;

      service.updateSet('p1', 's2', body).subscribe((s) => (result = s));

      const req = httpMock.expectOne({ method: 'PATCH', url: `${base}/p1/sets/s2` });
      expect(req.request.body).toEqual(body);
      req.flush(updated);

      expect(result).toEqual(updated);
    });
  });

  describe('reads', () => {
    it('getProgram sends a GET request to /programs/:id and returns cards', () => {
      let result: Program | undefined;

      service.getProgram('p1').subscribe((p) => (result = p));

      httpMock.expectOne({ method: 'GET', url: `${base}/p1` }).flush(program);
      expect(result?.exercises.map((c) => c.id)).toEqual(['card-1', 'card-2']);
    });

    it('getClientPrograms sends a GET request to /programs/client/:clientId', () => {
      let result: Program[] | undefined;

      service.getClientPrograms('c1').subscribe((list) => (result = list));

      httpMock.expectOne({ method: 'GET', url: `${base}/client/c1` }).flush([program]);
      expect(result).toEqual([program]);
    });

    it('getUpcomingPrograms sends a GET request to /programs/upcoming', () => {
      let result: Program[] | undefined;

      service.getUpcomingPrograms().subscribe((list) => (result = list));

      httpMock.expectOne({ method: 'GET', url: `${base}/upcoming` }).flush([program]);
      expect(result).toEqual([program]);
    });
  });

  describe('deleteProgram', () => {
    it('sends a DELETE request to /programs/:id', () => {
      service.deleteProgram('p1').subscribe();

      const req = httpMock.expectOne(`${base}/p1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
