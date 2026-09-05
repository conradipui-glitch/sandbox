import { describe, expect, it } from 'vitest';
import { createInitialState } from './scenarios';
import { simulateTurn, applyOutcome } from './simulation';
import type { GameState } from '../shared/types';
import { florenceOptions } from './florence-engine';

// Legacy authored resolver checks, kept separately from the live AI path.
const start = () => { const s = createInitialState('author-playtest', 'florence-workshop', 'chronicle'); s.options = florenceOptions(1, s.florence!); return s; };
const send = (s: GameState, a: string) => applyOutcome(s, a, simulateTurn(s, a));
function choose(s: GameState, id: string) {
  const option = s.options.find(o => o.id === `florence-v2-${id}`);
  if (!option) throw new Error(`Choice ${id} missing at scene ${s.turn}`);
  return send(s, option.intent);
}
const route = (ids: string[]) => ids.reduce(choose, start());

describe('Florence authored consequences and endings', () => {
  it('makes refusal a completed decision, not a request for permission', () => {
    const s = route(['close', 'refuse']);
    expect(s.lastOutcome?.resolution?.status).toBe('executed');
    expect(s.florence?.facts).toMatchObject({closed:true, refused:true});
    expect(s.florence?.facts.advance).toBeUndefined();
  });
  it('records a request without granting the desired agreement', () => {
    const s = route(['draft']);
    expect(s.lastOutcome?.resolution?.status).toBe('conditional');
    expect(s.florence?.facts.draft).toBe(true);
    expect(s.florence?.facts.agreed).toBeUndefined();
  });
  it('supports proof-backed negotiation and an earned acceptance', () => {
    const s = route(['draft','ledger','counter','pigment','public','deliver']);
    expect(s.status).toBe('victory');
    expect(s.lastOutcome?.headline).toBe('Незавершённое принято');
    expect(s.lastOutcome?.summary).toContain('Принят один фрагмент');
    expect(s.florence?.facts).toMatchObject({agreed:true,pigment:true});
    expect(s.options).toEqual([]);
    expect(s.florence?.trace).toHaveLength(6);
  });
  it('makes a paid compromise distinct from preserving an unsigned work', () => {
    const paid = route(['healer','team','advance','testimony','share-ledger','deliver']);
    const refused = route(['close','refuse','protect','testimony','rest','sign']);
    expect(paid.lastOutcome?.headline).toBe('Чужое имя над вашей работой');
    expect(refused.lastOutcome?.headline).toBe('Имя без заказчика');
    expect(paid.lastOutcome?.summary).toContain('Жар ещё не прошёл');
    expect(paid.lastOutcome?.reflection).toContain('ценой подписи');
    expect(refused.lastOutcome?.summary).not.toContain('Оплаченный осмотр');
  });
  it('returns actual advance once and remembers the withdrawn agreement', () => {
    const s = route(['healer','team','advance','withdraw','rest','deliver']);
    expect(s.florence?.facts).toMatchObject({advance:false, withdrawn:true, agreed:false});
    expect(s.lastOutcome?.summary).toContain('прежний договор отозван');
  });
  it('does not conjure money to return', () => {
    const s = route(['draft','ledger','counter']);
    const next = send(s, 'Вернуть аванс кардиналу');
    expect(next.turn).toBe(s.turn);
    expect(next.florence?.facts).toEqual(s.florence?.facts);
    expect(next.lastOutcome?.resolution?.requirement).toContain('не получен');
    expect(s.options.find(o => o.id.endsWith('withdraw'))?.title).toBe('Отозвать предложение');
  });
  it('does not rewrite facts from negated actions or arbitrary commands', () => {
    for (const action of ['Не отправлять Джулиано к лекарю', 'Я заставляю Джулиано работать', 'Продать мастерскую послу', 'Заставить всех полюбить меня']) {
      const s = send(start(), action);
      expect(s.turn).toBe(1);
      expect(s.florence?.facts).toEqual({});
    }
  });
  it('rejects an unknown compound clause atomically', () => {
    const s = send(start(), 'Отправить Джулиано к лекарю; продать мастерскую послу');
    expect(s.turn).toBe(1);
    expect(s.florence?.facts).toEqual({});
    expect(s.metrics.map(m=>m.value)).toEqual(start().metrics.map(m=>m.value));
  });
  it('does not execute a valid clause before failing a resource precondition', () => {
    const s = send(start(), 'Отправить Джулиано к лекарю; вернуть аванс кардиналу');
    expect(s.turn).toBe(1);
    expect(s.florence?.facts).toEqual({});
  });
  it('supports two recognised acts and records the full original text', () => {
    const action = 'Отправить Джулиано к лекарю; проверить пигмент на картоне';
    const s = send(start(), action);
    expect(s.turn).toBe(2);
    expect(s.florence?.facts).toMatchObject({healer:true,pigment:true});
    expect(s.florence?.trace[0].action).toBe(action);
  });
  it('persists real facts across save and restore, without charging twice', () => {
    const s = JSON.parse(JSON.stringify(route(['healer']))) as GameState;
    const again = send(s, 'Отправить Джулиано к лекарю');
    expect(again.turn).toBe(2);
    expect(again.metrics.map(m=>m.value)).toEqual(s.metrics.map(m=>m.value));
    expect(again.florence?.trace).toHaveLength(1);
  });
  it('keeps the final choice after a failed attempt', () => {
    const s = route(['healer','team','advance','pigment','rest']);
    const failed = send(s, 'Закончить фреску за час без красок, денег и людей');
    expect(failed.turn).toBe(6);
    expect(failed.status).toBe('active');
    const ended = choose(failed, 'workshop');
    expect(ended.lastOutcome?.headline).toBe('Ключ остаётся у мастера');
    expect(ended.date).toBe('1512-04-18');
  });
  it('does not invent missing facts for a legacy save', () => {
    const s = route(['healer']); delete s.florence;
    const next = send(s, s.options[0].intent);
    expect(next.turn).toBe(s.turn);
    expect(next.lastOutcome?.resolution?.requirement).toContain('прежняя сессия');
  });
  it('all 729 prepared routes have six distinct decisions and a complete ending', () => {
    function walk(s: GameState): void {
      if (s.status !== 'active') {
        expect(s.turn).toBe(7);
        expect(s.florence?.trace).toHaveLength(6);
        expect(s.lastOutcome?.summary).not.toMatch(/undefined|NaN/);
        expect(s.lastOutcome?.reflection).toBeTruthy();
        expect(s.options).toEqual([]);
        return;
      }
      expect(s.options).toHaveLength(3);
      for (const option of s.options) {
        const next = send(s, option.intent);
        expect(next.turn).toBe(s.turn+1);
        walk(next);
      }
    }
    walk(start());
  });
});
