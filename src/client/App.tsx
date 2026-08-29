import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Compass,
  Crown,
  Gauge,
  Landmark,
  LoaderCircle,
  Radio,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { DecisionOption, GameMode, GameState, ScenarioSummary } from "../shared/types";
import { api } from "./api";
import minister1917 from "./assets/characters/minister-1917.webp";
import officer1917 from "./assets/characters/officer-stavka-1917.webp";
import lidia1917 from "./assets/characters/lidia-vetrova-1917.webp";
import staffCar1917 from "./assets/vehicles/staff-car-1917.webp";

type TextScale = "standard" | "large" | "xlarge";

const modeOptions: Array<{ id: GameMode; title: string; duration: string; description: string }> = [
  { id: "chronicle", title: "Хроника", duration: "8–12 ходов", description: "Один кризис и плотный эпилог" },
  { id: "campaign", title: "Кампания", duration: "25–40 ходов", description: "Четыре акта и возвращающиеся последствия" },
  { id: "sandbox", title: "Песочница", duration: "Без лимита", description: "Свободная цель и продолжающийся мир" },
];

const fallbackScenarios: ScenarioSummary[] = [
  {
    id: "russia-1917",
    title: "Россия после отречения",
    period: "Март 1917",
    role: "Глава Временного правительства",
    hook: "Империи больше нет. Война продолжается. У вас нет ни конституции, ни надёжной армии — только несколько недель доверия.",
    difficulty: "Безжалостно",
    accent: "#c94c36",
    available: true,
  },
  {
    id: "ussr-1985",
    title: "Союз на изломе",
    period: "Март 1985",
    role: "Генеральный секретарь",
    hook: "Экономика теряет темп, элиты не хотят перемен, а общество ещё не знает, что старый договор почти исчерпан.",
    difficulty: "Сложно",
    accent: "#b3975a",
    available: false,
  },
  {
    id: "rome-49bc",
    title: "Республика без Цезаря",
    period: "Январь 49 до н. э.",
    role: "Первый консул Рима",
    hook: "Легион перешёл Рубикон. Сенат расколот. Сохранить республику можно — но не теми решениями, которые уже вошли в историю.",
    difficulty: "Безжалостно",
    accent: "#8a6a43",
    available: false,
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

function Seal({ children }: { children: React.ReactNode }) {
  return <span className="seal">{children}</span>;
}

function TextScaleControl({ value, onChange }: { value: TextScale; onChange: (value: TextScale) => void }) {
  const options: Array<{ value: TextScale; label: string; title: string }> = [
    { value: "standard", label: "A", title: "Обычный крупный текст" },
    { value: "large", label: "A+", title: "Увеличенный текст" },
    { value: "xlarge", label: "A++", title: "Максимальный текст" },
  ];

  return (
    <div className="text-scale-control" role="group" aria-label="Размер текста">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Landing({ scenarios, onStart, busy, textScale, onTextScale }: { scenarios: ScenarioSummary[]; onStart: (id: string, mode: GameMode) => void; busy: boolean; textScale: TextScale; onTextScale: (value: TextScale) => void }) {
  const [selected, setSelected] = useState(scenarios.find((item) => item.available)?.id ?? scenarios[0]?.id);
  const [mode, setMode] = useState<GameMode>("campaign");
  const scenario = scenarios.find((item) => item.id === selected) ?? scenarios[0];

  return (
    <main className="landing shell">
      <nav className="topbar">
        <div className="brand"><Seal>ИИ</Seal><span>Переиграть историю</span></div>
        <div className="topbar-tools">
          <div className="topbar-note"><Radio size={15} /> Живой движок последствий</div>
          <TextScaleControl value={textScale} onChange={onTextScale} />
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>ALTERNATIVE HISTORY ENGINE</span><i /></div>
          <h1>История уже случилась.<br /><em>Но не здесь.</em></h1>
          <p className="lead">Вы управляете государством. Мир не ждёт выбора из меню: он отвечает на любое ваше решение — интересами людей, дефицитом ресурсов и непредвиденными союзами.</p>
          <div className="promise-row">
            <span><Sparkles size={17} /> Ни одного прописанного финала</span>
            <span><Compass size={17} /> Любое решение — допустимый ход</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="year year-a">1917</div>
          <div className="year year-b">1985</div>
          <div className="year year-c">?</div>
          <svg className="map-lines" viewBox="0 0 500 420">
            <path d="M45 205 C132 121, 187 122, 240 168 S339 243, 450 158" />
            <path d="M80 295 C159 247, 235 286, 281 245 S370 174, 439 271" />
            <path d="M142 76 C184 158, 147 229, 224 340" />
          </svg>
          <div className="artifact-card"><span>Точка расхождения</span><strong>Вы принимаете<br />первое решение</strong><i /></div>
        </div>
      </section>

      <section className="scenario-section">
        <div className="section-heading">
          <div><span className="index">01</span><h2>Выберите точку разлома</h2></div>
          <p>Первая глава доступна уже сейчас. Остальные покажут направление вселенной продукта.</p>
        </div>
        <div className="scenario-grid">
          {scenarios.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`scenario-card ${selected === item.id ? "selected" : ""} ${!item.available ? "locked" : ""}`}
              onClick={() => setSelected(item.id)}
              style={{ "--accent": item.accent } as React.CSSProperties}
            >
              <span className="card-number">0{index + 1}</span>
              <div className="scenario-era">{item.period}</div>
              <h3>{item.title}</h3>
              <p>{item.hook}</p>
              <div className="scenario-meta"><span>{item.role}</span><span>{item.difficulty}</span></div>
              {!item.available && <span className="coming">Скоро</span>}
              {selected === item.id && <span className="selection-mark"><ChevronRight size={18} /></span>}
            </button>
          ))}
        </div>
        <div className="mode-picker" aria-label="Режим игры">
          {modeOptions.map((item) => (
            <button type="button" key={item.id} className={mode === item.id ? "selected" : ""} onClick={() => setMode(item.id)}>
              <span>{item.duration}</span><strong>{item.title}</strong><small>{item.description}</small>
            </button>
          ))}
        </div>
        <div className="launch-row">
          <div className="launch-brief"><ShieldAlert size={20} /><span><strong>Правило мира:</strong> ИИ не обязан делать ваш план успешным. Он обязан сделать ответ мира правдоподобным.</span></div>
          <button className="primary" disabled={!scenario?.available || busy} onClick={() => scenario && onStart(scenario.id, mode)}>
            {busy ? <LoaderCircle className="spin" size={20} /> : <Crown size={20} />}
            Начать правление
            <ArrowRight size={20} />
          </button>
        </div>
      </section>
    </main>
  );
}

function MetricGauge({ value, trend, label }: { value: number; trend: number; label: string }) {
  return (
    <div className="metric">
      <div className="metric-top"><span>{label}</span><strong>{value}</strong></div>
      <div className="metric-track"><i style={{ width: `${value}%` }} /></div>
      <small className={trend > 0 ? "up" : trend < 0 ? "down" : "flat"}>{trend > 0 ? `+${trend}` : trend === 0 ? "—" : trend} за ход</small>
    </div>
  );
}

function DecisionComposer({ options, onSubmit, busy }: { options: DecisionOption[]; onSubmit: (value: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setText("");
    setSelected(null);
  }, [options]);

  const pick = (option: DecisionOption) => {
    setSelected(option.id);
    setText(option.intent);
  };

  return (
    <section className="decision-panel">
      <div className="panel-title"><span>Ваш следующий ход</span><small>Решение не ограничено вариантами</small></div>
      <div className="decision-options">
        {options.map((option) => (
          <button key={option.id} className={selected === option.id ? "picked" : ""} onClick={() => pick(option)}>
            <div><span className={`risk risk-${option.risk}`}>{option.risk}</span><ArrowRight size={15} /></div>
            <strong>{option.title}</strong><p>{option.description}</p>
          </button>
        ))}
      </div>
      <div className="freeform">
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Или отдайте собственный приказ: что именно вы делаете, с кем договариваетесь, чем готовы рискнуть…" maxLength={700} />
        <div className="composer-footer"><span>{text.length}/700 · мир ответит последствиями</span><button disabled={busy || text.trim().length < 4} onClick={() => onSubmit(text)}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Разыграть ход</button></div>
      </div>
    </section>
  );
}

function Outcome({ state }: { state: GameState }) {
  const outcome = state.lastOutcome;
  if (!outcome) return null;
  return (
    <section className="outcome">
      <div className="outcome-kicker"><Radio size={15} /> Последствия предыдущего решения <span>{outcome.provider === "deepseek" ? "DeepSeek" : outcome.provider === "cloudflare" ? "Cloudflare AI" : outcome.source === "ai" ? "ИИ" : "симулятор"}</span></div>
      <h2>{outcome.headline}</h2>
      <p>{outcome.summary}</p>
      <blockquote>{outcome.dispatch}</blockquote>
      {outcome.surprise && <div className="surprise"><ShieldAlert size={20} /><div><strong>Непредвиденное последствие</strong><p>{outcome.surprise}</p></div></div>}
      <div className="reaction-grid">
        {outcome.reactions.map((reaction) => <div key={reaction.faction}><span className={`stance stance-${reaction.stance}`}>{reaction.stance}</span><strong>{reaction.faction}</strong><p>{reaction.text}</p></div>)}
      </div>
    </section>
  );
}

function Game({ state, onTurn, onExit, busy, textScale, onTextScale }: { state: GameState; onTurn: (action: string) => void; onExit: () => void; busy: boolean; textScale: TextScale; onTextScale: (value: TextScale) => void }) {
  const stability = state.metrics.find((metric) => metric.id === "stability")?.value ?? 50;
  const armyReaction = state.lastOutcome?.reactions.find((reaction) => reaction.faction.includes("Став"));
  const activeCharacters = state.lastOutcome?.scene.activeCharacterIds ?? [];
  const sceneProps = state.lastOutcome?.scene.propIds ?? [];
  const showLidia = activeCharacters.includes("lidia-vetrova");
  const showOfficer = Boolean(state.lastOutcome) && !showLidia && (activeCharacters.includes("colonel-argunov") || activeCharacters.length === 0);
  const showCar = sceneProps.includes("staff-renault");
  const modeTitle = modeOptions.find((mode) => mode.id === state.mode)?.title ?? "Кампания";
  const guestCaption = showLidia ? "Лидия привезла перехваченную телеграмму" : showOfficer ? "Ставка требует ответа кабинета" : "Кабинет ждёт вашего решения";
  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="icon-button" onClick={onExit} title="К сценариям"><ArrowLeft size={19} /></button>
        <div className="game-identity"><Seal>ИИ</Seal><div><span>{state.scenarioTitle}</span><small>{state.role} · {modeTitle}</small></div></div>
        <div className="game-date"><Clock3 size={17} /><span>{formatDate(state.date)}</span><b>Ход {state.turn}</b><TextScaleControl value={textScale} onChange={onTextScale} /></div>
      </header>

      <div className="game-layout">
        <aside className="state-rail">
          <div className="rail-heading"><Gauge size={17} /> Состояние страны</div>
          <div className="metrics-list">{state.metrics.map((metric) => <MetricGauge key={metric.id} {...metric} />)}</div>
          <div className="factions">
            <div className="rail-heading"><Landmark size={17} /> Центры силы</div>
            {state.factions.map((faction) => <div className="faction" key={faction.name}><div><strong>{faction.name}</strong><span>{faction.mood}</span></div><b>{faction.power}</b></div>)}
          </div>
          <div className="objective"><span>Цель правления</span><p>{state.objective}</p></div>
        </aside>

        <div className="main-stage">
          <section className={`scene-tableau ${stability < 30 ? "scene-unrest" : ""}`} aria-label="Кабинет Временного правительства">
            <div className="scene-grid" />
            <div className="scene-window"><i /><i /><i /></div>
            <div className="scene-map"><span>ПЕТРОГРАД</span><i /><i /><i /></div>
            <div className="scene-desk"><span /><span /></div>
            {showCar && <div className="scene-vehicle"><img src={staffCar1917} alt="Штабной автомобиль у входа" /></div>}
            {showOfficer && (
              <div className={`scene-character scene-character-officer stance-${armyReaction?.stance ?? "настороженность"}`}>
                <img src={officer1917} alt="Офицер Ставки с оперативной картой" />
              </div>
            )}
            {showLidia && (
              <div className="scene-character scene-character-lidia">
                <img src={lidia1917} alt="Журналистка и автокурьер Лидия Ветрова с телеграммами" />
              </div>
            )}
            <div className="scene-character scene-character-minister">
              <img src={minister1917} alt="Министр Аркадий Левицкий с красным портфелем" />
            </div>
            <div className={`scene-caption ${showOfficer || showLidia ? "scene-caption-dialogue" : ""}`}>
              <span>Петроград · Таврический дворец</span>
              <strong>{guestCaption}</strong>
            </div>
            <div className="scene-live"><i /> Живая сцена</div>
          </section>
          <section className="briefing">
            <div className="briefing-index">{String(state.turn).padStart(2, "0")}</div>
            <div><span className="eyebrow-small">Оперативная обстановка</span><h1>{state.turn === 1 ? "Власть существует только до первого неверного решения" : state.lastOutcome?.headline}</h1><p>{state.briefing}</p></div>
          </section>
          <Outcome state={state} />
          {state.status === "active" ? <DecisionComposer options={state.options} onSubmit={onTurn} busy={busy} /> : <div className="end-state"><h2>{state.status === "victory" ? "Новый порядок устоял" : "Государство распалось"}</h2><p>Эта ветка истории завершена. Можно вернуться к точке разлома и попробовать другую стратегию.</p><button onClick={onExit}><RotateCcw size={18} /> Начать заново</button></div>}
        </div>

        <aside className="chronicle">
          <div className="rail-heading"><BookOpen size={17} /> Ваша хроника</div>
          <div className="timeline">
            {[...state.timeline].reverse().map((entry) => <article key={entry.id} className={`timeline-entry ${entry.kind}`}><time>{formatDate(entry.date)}</time><strong>{entry.title}</strong><p>{entry.description}</p></article>)}
          </div>
        </aside>
      </div>
      {busy && <div className="world-thinking"><div><LoaderCircle className="spin" /><strong>Мир отвечает на ваше решение</strong><span>Фракции пересчитывают интересы. История ищет новую траекторию.</span></div></div>}
    </main>
  );
}

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>(fallbackScenarios);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textScale, setTextScale] = useState<TextScale>(() => {
    const saved = localStorage.getItem("living-history-text-scale");
    return saved === "large" || saved === "xlarge" ? saved : "standard";
  });

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => undefined);
    const saved = localStorage.getItem("living-history-session");
    if (saved) api.getGame(saved).then(setGame).catch(() => localStorage.removeItem("living-history-session"));
  }, []);

  const start = async (id: string, mode: GameMode) => {
    setBusy(true); setError(null);
    try {
      const state = await api.createGame(id, mode);
      localStorage.setItem("living-history-session", state.id);
      setGame(state);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать игру"); }
    finally { setBusy(false); }
  };

  const playTurn = async (action: string) => {
    if (!game) return;
    setBusy(true); setError(null);
    try { setGame(await api.playTurn(game.id, action)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Мир не ответил на ход"); }
    finally { setBusy(false); }
  };

  const exit = () => { localStorage.removeItem("living-history-session"); setGame(null); setError(null); };
  const changeTextScale = (value: TextScale) => {
    setTextScale(value);
    localStorage.setItem("living-history-text-scale", value);
  };
  const content = useMemo(() => game
    ? <Game state={game} onTurn={playTurn} onExit={exit} busy={busy} textScale={textScale} onTextScale={changeTextScale} />
    : <Landing scenarios={scenarios} onStart={start} busy={busy} textScale={textScale} onTextScale={changeTextScale} />,
  [game, scenarios, busy, textScale]);

  return <div className={`app-root text-scale-${textScale}`}>{content}{error && <div className="error-toast"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}</div>;
}
