import { describe, expect, it } from 'vitest';
import { createInitialState } from './scenarios';
import { florenceEditorialMessages, florenceMessages } from './florence-ai';

const state = () => createInitialState('florence-continuity-check', 'florence-workshop');

describe('Florence continuity guardrails', () => {
  it('keeps canonical character identity while preserving improvisation', () => {
    const system = florenceMessages(state(), 'Погладить кота и спросить Луку о договоре')[0].content;
    expect(system).toContain('Бартоломео Риччи — мужчина');
    expect(system).toContain('свободно придумывай НОВОЕ будущее');
    expect(system).toContain('уже установленную реальность не переписывай');
  });

  it('protects the literal player action and scene presence in the editorial pass', () => {
    const editorial = florenceEditorialMessages(state(), 'Оставь мне копию условий', {})[0].content;
    expect(editorial).toContain('Не добавляй игроку новую просьбу');
    expect(editorial).toContain('ещё не пришёл');
    expect(editorial).toContain('Бартоломео Риччи — мужчина');
    expect(editorial).toContain('Новое допустимо');
  });
});
