import { parseTimeOfDay } from '../src/lib/dates';

describe('parseTimeOfDay', () => {
  it('accepts partial and unpadded input', () => {
    expect(parseTimeOfDay('9')).toEqual({
      hours: 9,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    expect(parseTimeOfDay('9:5')).toMatchObject({ hours: 9, minutes: 5 });
    expect(parseTimeOfDay(' 09:05:07 ')).toMatchObject({ seconds: 7 });
    expect(parseTimeOfDay('09:05:07,25')).toMatchObject({
      milliseconds: 250,
    });
  });

  it('rejects out-of-range components instead of clamping them', () => {
    expect(parseTimeOfDay('24')).toBeNull();
    expect(parseTimeOfDay('12:60')).toBeNull();
    expect(parseTimeOfDay('12:30:60')).toBeNull();
    expect(parseTimeOfDay('12:3o')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
  });

  it('applies typed and fallback meridiems in 12-hour mode', () => {
    expect(parseTimeOfDay('7:30 pm')).toMatchObject({ hours: 19 });
    expect(parseTimeOfDay('7:30p')).toMatchObject({ hours: 19 });
    expect(parseTimeOfDay('12:30 AM')).toMatchObject({ hours: 0 });
    expect(
      parseTimeOfDay('7:30', { is24Hour: false, fallbackMeridiem: 'PM' }),
    ).toMatchObject({ hours: 19 });
    expect(
      parseTimeOfDay('19:30', { is24Hour: false, fallbackMeridiem: 'PM' }),
    ).toBeNull();
  });

  it('ignores the fallback meridiem in 24-hour mode', () => {
    expect(
      parseTimeOfDay('7:30', { is24Hour: true, fallbackMeridiem: 'PM' }),
    ).toMatchObject({ hours: 7 });
  });
});
