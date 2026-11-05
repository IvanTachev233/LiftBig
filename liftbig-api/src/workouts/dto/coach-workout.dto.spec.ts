import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
  CoachCardInput,
  CoachSetInput,
  CreateCoachWorkoutDto,
  UpdateCoachWorkoutDto,
} from './coach-workout.dto';

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const CARD_ID = '33333333-3333-4333-8333-333333333333';
const SET_ID = '44444444-4444-4444-8444-444444444444';

const whitelist = { whitelist: true };
const strict = { whitelist: true, forbidNonWhitelisted: true };

const card = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: EXERCISE_ID,
  order: 1,
  sets: [{ reps: 5, weight: 100, order: 1 }],
  ...overrides,
});

const createBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Squat day',
  date: '2026-10-10',
  exercises: [card()],
  ...overrides,
});

function setErrors(errors: ValidationError[]): ValidationError[] {
  return (
    errors[0]?.children?.[0]?.children?.find((e) => e.property === 'sets')
      ?.children?.[0]?.children ?? []
  );
}

describe('CreateCoachWorkoutDto', () => {
  it('accepts planned cards and keeps every planned field', async () => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({
        notes: 'Go easy',
        exercises: [
          card({
            supersetGroup: GROUP_ID,
            sets: [{ reps: 3, weight: null, notes: 'pause', order: 1 }],
          }),
        ],
      }),
    );
    expect(await validate(dto, strict)).toHaveLength(0);
    expect(dto.exercises[0]).toBeInstanceOf(CoachCardInput);
    expect(dto.exercises[0].sets[0]).toBeInstanceOf(CoachSetInput);
    expect(dto.exercises[0].sets[0]).toMatchObject({
      reps: 3,
      weight: null,
      notes: 'pause',
      order: 1,
    });
  });

  it.each([
    ['name', { name: undefined }],
    ['date', { date: 'soon' }],
    ['exercises', { exercises: undefined }],
    ['exercises', { exercises: 'abc' }],
  ])('rejects a bad %s', async (property, overrides) => {
    const errors = await validate(
      plainToInstance(CreateCoachWorkoutDto, createBody(overrides)),
      whitelist,
    );
    expect(errors.map((e) => e.property)).toContain(property);
  });

  it.each(['made', 'actualReps', 'actualWeight'])(
    'rejects a set carrying %s under the global whitelist',
    async (property) => {
      const value = property === 'made' ? true : 5;
      const dto = plainToInstance(
        CreateCoachWorkoutDto,
        createBody({
          exercises: [card({ sets: [{ reps: 5, [property]: value }] })],
        }),
      );
      const errors = await validate(dto, whitelist);
      expect(setErrors(errors).map((e) => e.property)).toEqual([property]);
    },
  );

  it('rejects a null made too', async () => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({ exercises: [card({ sets: [{ reps: 5, made: null }] })] }),
    );
    const errors = await validate(dto, whitelist);
    expect(setErrors(errors).map((e) => e.property)).toEqual(['made']);
  });

  it('rejects status under the global whitelist', async () => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({ status: 'COMPLETED' }),
    );
    const errors = await validate(dto, whitelist);
    expect(errors.map((e) => e.property)).toEqual(['status']);
  });

  it.each([
    ['reps', { reps: 2.5 }],
    ['weight', { reps: 5, weight: 'x' }],
    ['notes', { reps: 5, notes: 7 }],
    ['order', { reps: 5, order: 'x' }],
  ])('rejects a set with a bad %s', async (property, set) => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({ exercises: [card({ sets: [set] })] }),
    );
    const errors = await validate(dto, whitelist);
    expect(setErrors(errors).map((e) => e.property)).toContain(property);
  });
  it.each([
    ['a blank', null],
    ['zero', 0],
    ['negative', -1],
  ])('rejects %s planned reps', async (_, reps) => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({ exercises: [card({ sets: [{ reps }] })] }),
    );
    const errors = await validate(dto, whitelist);
    expect(setErrors(errors).map((e) => e.property)).toEqual(['reps']);
  });
});

describe('UpdateCoachWorkoutDto', () => {
  it('accepts a partial body and keeps card and set ids', async () => {
    const dto = plainToInstance(UpdateCoachWorkoutDto, {
      date: '2026-10-11',
      exercises: [
        card({
          id: CARD_ID,
          sets: [{ id: SET_ID, reps: 5, weight: 100, order: 1 }],
        }),
      ],
    });
    expect(await validate(dto, strict)).toHaveLength(0);
    expect(dto.exercises?.[0].id).toBe(CARD_ID);
    expect(dto.exercises?.[0].sets[0].id).toBe(SET_ID);
    expect(
      await validate(plainToInstance(UpdateCoachWorkoutDto, {}), strict),
    ).toHaveLength(0);
  });

  it.each([
    ['name', { name: null }],
    ['date', { date: null }],
  ])('rejects an explicit null %s', async (property, body) => {
    const errors = await validate(
      plainToInstance(UpdateCoachWorkoutDto, body),
      whitelist,
    );
    expect(errors.map((e) => e.property)).toEqual([property]);
  });

  it('rejects a set carrying made under the global whitelist', async () => {
    const dto = plainToInstance(UpdateCoachWorkoutDto, {
      exercises: [card({ sets: [{ id: SET_ID, reps: 5, made: false }] })],
    });
    const errors = await validate(dto, whitelist);
    expect(setErrors(errors).map((e) => e.property)).toEqual(['made']);
  });

  it('rejects status under the global whitelist', async () => {
    const dto = plainToInstance(UpdateCoachWorkoutDto, { status: 'PLANNED' });
    const errors = await validate(dto, whitelist);
    expect(errors.map((e) => e.property)).toEqual(['status']);
  });

  it('rejects a non-uuid card or set id', async () => {
    const badCard = plainToInstance(UpdateCoachWorkoutDto, {
      exercises: [card({ id: 'nope' })],
    });
    const cardErrors =
      (await validate(badCard, whitelist))[0]?.children?.[0]?.children ?? [];
    expect(cardErrors.map((e) => e.property)).toContain('id');

    const badSet = plainToInstance(UpdateCoachWorkoutDto, {
      exercises: [card({ sets: [{ id: 'nope', reps: 5 }] })],
    });
    expect(
      setErrors(await validate(badSet, whitelist)).map((e) => e.property),
    ).toContain('id');
  });
});

// Past these the int4 and numeric(6,2) columns fail, which was a 500
describe('coach set and card numbers stay within their columns', () => {
  const INT_MAX = 2147483647;
  const INT_MIN = -2147483648;

  it.each([
    ['reps', { reps: INT_MAX + 1 }],
    ['order', { reps: 5, order: INT_MAX + 1 }],
    ['order', { reps: 5, order: INT_MIN - 1 }],
    ['weight', { reps: 5, weight: 10000 }],
    ['weight', { reps: 5, weight: -10000 }],
  ])('rejects a set %s past its column', async (property, set) => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({ exercises: [card({ sets: [set] })] }),
    );
    expect(
      setErrors(await validate(dto, whitelist)).map((e) => e.property),
    ).toEqual([property]);
  });

  it('accepts a set at every column limit', async () => {
    const dto = plainToInstance(
      CreateCoachWorkoutDto,
      createBody({
        exercises: [
          card({
            order: INT_MIN,
            sets: [{ reps: INT_MAX, weight: 9999.99, order: INT_MAX }],
          }),
        ],
      }),
    );
    expect(await validate(dto, whitelist)).toHaveLength(0);
  });

  it.each([INT_MAX + 1, INT_MIN - 1])(
    'rejects a card order of %p',
    async (order) => {
      const dto = plainToInstance(
        CreateCoachWorkoutDto,
        createBody({ exercises: [card({ order })] }),
      );
      const errors = await validate(dto, whitelist);
      expect(
        errors[0]?.children?.[0]?.children?.map((e) => e.property),
      ).toEqual(['order']);
    },
  );
});
