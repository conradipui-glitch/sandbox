import { describe, expect, it } from 'vitest';
import { createInitialState } from './scenarios';
import { applyOutcome, simulateTurn } from './simulation';

describe('Florence factual regressions', () => {
  const start = () => createInitialState('florence-review', 'florence-workshop', 'chronicle');
  it('does not spend a scene on an impossible order', () => {
    const s = start();
    const action = 'Закончить фреску за час без красок, денег и людей';
    const next = applyOutcome(s, action, simulateTurn(s, action));
    expect(next.turn).toBe(s.turn);
    expect(next.metrics.map(m => m.value)).toEqual(s.metrics.map(m => m.value));
  });
  it('does not mistake a negated medical action for care', () => {
    const s = start();
    expect(simulateTurn(s, 'Не отправлять Джулиано к лекарю').resolution?.status).not.toBe('executed');
  });
  it('does not pretend to understand unimplemented actions', () => {
    expect(simulateTurn(start(), 'Продать мастерскую венецианскому послу').resolution?.status).toBe('conditional');
  });
  it('keeps the six pressure points within the same day', () => {
    const s = start();
    const a = s.options[1].intent;
    expect(applyOutcome(s, a, simulateTurn(s, a)).date).toBe(s.date);
  });
});
