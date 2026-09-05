import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from './scenarios';
import { generateOutcome } from './index';
import { florenceMessages, validateFlorenceAi } from './florence-ai';
import { applyOutcome } from './simulation';

const start = () => createInitialState('florence-ai-check', 'florence-workshop');
const answer = () => ({
  headline: 'Кот устроился на договоре',
  summary: 'Вы гладите кота, и он укладывается на край бумаги. Лука придерживает чернильницу и впервые за вечер улыбается. Разговор прерывается на несколько минут, но деньги и договор пока остаются у секретаря.',
  nextTitle: 'Лука ждёт вашего ответа', nextBriefing: 'Кот прижал лапой край бумаги. Лука предлагает убрать договор на чистый стол и обсудить срок сдачи работы.',
  resolution: { status: 'executed', explanation: 'Вы погладили кота; договор ещё не заключён.', cost: 'Прошло несколько минут. Денег вы не потратили.' },
  advanceScene: true, facts: { catPresent: true }, events: ['Кот лёг на договор, Лука улыбнулся.'],
  effects: [{ id: 'diplomacy', delta: 1, reason: 'Короткая пауза смягчила разговор.' }],
  nextOptions: [
    { id: 'cat', title: 'Пересадить кота на стул', description: 'Освободить бумагу и вернуться к разговору.', intent: 'Пересадить кота на стул и попросить Луку объяснить условие договора.', risk: 'низкий' },
    { id: 'show', title: 'Показать незавершённое небо', description: 'Объяснить, почему показ нужно перенести.', intent: 'Показать Луке незавершённое небо и попросить ещё одну ночь.', risk: 'средний' },
    { id: 'food', title: 'Предложить Луке поужинать', description: 'Потратить немного припасов на общий ужин.', intent: 'Пригласить Луку за наш стол и продолжить разговор за едой.', risk: 'низкий' },
  ], scene: { locationId: 'florence-workshop', activeCharacterIds: ['florence-secretary'], propIds: [] },
  sceneDialogue: [{ speaker: 'Лука, секретарь кардинала', line: 'Похоже, у вас здесь ещё один хозяин.' }],
});
const envWith = (run: (...args: unknown[]) => unknown) => ({ AI: { run } }) as unknown as Parameters<typeof generateOutcome>[0];
afterEach(() => vi.restoreAllMocks());

describe('Florence live AI boundary', () => {
  it('sends the complete edited action to the configured AI and uses new options', async () => {
    const action = 'Попросить Луку уйти. Подарить ему миниатюру с портретом девушки, раннюю работу Джулиано.';
    const run = vi.fn(async () => ({ response: JSON.stringify(answer()), usage: { prompt_tokens: 800, completion_tokens: 300 } }));
    const s = start();
    const out = await generateOutcome(envWith(run), s, action);
    expect(run).toHaveBeenCalledOnce();
    const request = run.mock.calls[0] as unknown as [string, { messages: Array<{ content: string }> }];
    expect(JSON.parse(request[1].messages[1].content).action).toBe(action);
    expect(out.source).toBe('ai'); expect(out.provider).toBe('cloudflare');
    expect(out.nextOptions[0].title).toBe('Пересадить кота на стул');
    expect(out.usage?.totalTokens).toBe(1100);
    expect(out.florence?.trace[0].action).toBe(action);
  });
  it('persists novel events across storage and includes them in the next model request', () => {
    const s = start(); const action = 'Гладить котов';
    const out = validateFlorenceAi(answer(), s, action, 'cloudflare')!;
    const next = JSON.parse(JSON.stringify(applyOutcome(s, action, out)));
    const context = JSON.parse(florenceMessages(next, 'Угостить всех пирожками')[1].content);
    expect(context.memory.events.join(' ')).toContain('Кот');
    expect(context.memory.trace[0].action).toBe(action);
    expect(next.turn).toBe(2);
  });
  it('keeps a wholly blocked action from changing facts, metrics or scene', () => {
    const s = start(); const c = answer(); c.resolution.status = 'blocked';
    c.facts = { catPresent: true }; c.effects[0].delta = 100;
    const out = validateFlorenceAi(c, s, 'Создать краску из воздуха', 'cloudflare')!;
    const next = applyOutcome(s, 'Создать краску из воздуха', out);
    expect(next.turn).toBe(1); expect(next.florence?.facts).toEqual({});
    expect(next.metrics.map(m => m.value)).toEqual(s.metrics.map(m => m.value));
  });
  it('requires a complete ending and reflection on the last completed scene', () => {
    const s = start(); s.turn = 6;
    expect(validateFlorenceAi(answer(), s, 'Закончить разговор', 'cloudflare')).toBeNull();
    const c = { ...answer(), reflection: 'Что вы хотели изменить этой паузой с котом?' };
    const out = validateFlorenceAi(c, s, 'Закончить разговор', 'cloudflare')!;
    const next = applyOutcome(s, 'Закончить разговор', out);
    expect(next.status).toBe('victory'); expect(next.options).toEqual([]);
    expect(next.lastOutcome?.reflection).toContain('котом');
  });
  it('does not turn provider failure or invalid output into a scripted success', async () => {
    await expect(generateOutcome(envWith(async () => { throw new Error('unavailable'); }), start(), 'Гладить котов')).rejects.toThrow('ai_unavailable');
    await expect(generateOutcome(envWith(async () => ({ response: '{"headline":"ok","summary":"ok"}' })), start(), 'Гладить котов')).rejects.toThrow('ai_invalid_contract');
  });
  it('retries malformed JSON once without spending a scene or losing the action', async () => {
    const run = vi.fn().mockResolvedValueOnce({ response: '{"summary":' }).mockResolvedValueOnce({ response: JSON.stringify(answer()) });
    const out = await generateOutcome(envWith(run), start(), 'Гладить котов');
    expect(run).toHaveBeenCalledTimes(2);
    expect(out.florence?.trace).toHaveLength(1);
    expect(out.florence?.trace[0].action).toBe('Гладить котов');
  });
});
