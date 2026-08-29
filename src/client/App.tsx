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
import type { DecisionOption, GameState, ScenarioSummary } from "../shared/types";
import { api } from "./api";
import minister1917 from "./assets/characters/minister-1917.webp";
import officer1917 from "./assets/characters/officer-stavka-1917.webp";

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

function Landing({ scenarios, onStart, busy }: { scenarios: ScenarioSummary[]; onStart: (id: string) => void; busy: boolean }) {
  const [selected, setSelected] = useState(scenarios.find((item) => item.available)?.id ?? scenarios[0]?.id);
  const scenario = scenarios.find((item) => item.id === selected) ?? scenarios[0];

  return (
    <main className="landing shell">
      <nav className="topbar">
        <div className="brand"><Seal>ИИ</Seal><span>Переиграть историю</span></div>
        <div className="topbar-note"><Radio size={15} /> Живой движок последствий</div>
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
        <div className="launch-row">
          <div className="launch-brief"><ShieldAlert size={20} /><span><strong>Правило мира:</strong> ИИ не обязан делать ваш план успешным. Он обязан сделать ответ мира правдоподобным.</span></div>
          <button className="primary" disabled={!scenario?.available || busy} onClick={() => scenario && onStart(scenario.id)}>
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
      <div className="outcome-kicker"><Radio size={15} /> Последствия предыдущего решения <span>{outcome.source === "ai" ? "ИИ" : "симулятор"}</span></div>
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

function Game({ state, onTurn, onExit, busy }: { state: GameState; onTurn: (action: string) => void; onExit: () => void; busy: boolean }) {
  const stability = state.metrics.find((metric) => metric.id === "stability")?.value ?? 50;
  const armyReaction = state.lastOutcome?.reactions.find((reaction) => reaction.faction.includes("Став"));
  const showOfficer = Boolean(state.lastOutcome);
  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="icon-button" onClick={onExit} title="К сценариям"><ArrowLeft size={19} /></button>
        <div className="game-identity"><Seal>ИИ</Seal><div><span>{state.scenarioTitle}</span><small>{state.role}</small></div></div>
        <div className="game-date"><Clock3 size={17} /><span>{formatDate(state.date)}</span><b>Ход {state.turn}</b></div>
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
            {showOfficer && (
              <div className={`scene-character scene-character-officer stance-${armyReaction?.stance ?? "настороженность"}`}>
                <img src={officer1917} alt="Офицер Ставки с оперативной картой" />
              </div>
            )}
            <div className="scene-character scene-character-minister">
              <img src={minister1917} alt="Министр Временного правительства с запечатанным государственным досье" />
            </div>
            <div className={`scene-caption ${showOfficer ? "scene-caption-dialogue" : ""}`}>
              <span>Петроград · Таврический дворец</span>
              <strong>{showOfficer ? "Ставка требует ответа кабинета" : "Кабинет ждёт вашего решения"}</strong>
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

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => undefined);
    const saved = localStorage.getItem("living-history-session");
    if (saved) api.getGame(saved).then(setGame).catch(() => localStorage.removeItem("living-history-session"));
  }, []);

  const start = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const state = await api.createGame(id);
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
  const content = useMemo(() => game ? <Game state={game} onTurn={playTurn} onExit={exit} busy={busy} /> : <Landing scenarios={scenarios} onStart={start} busy={busy} />, [game, scenarios, busy]);

  return <>{content}{error && <div className="error-toast"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}</>;
}
