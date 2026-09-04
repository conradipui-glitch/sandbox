import type { DecisionOption, GameState, MetricId, TurnOutcome } from "../shared/types";
import { gameModes, worldContextForTurn } from "./world";
import { lastTrainOptions } from "./scenarios";
import { russia1917CampaignBeatForTurn } from "./scenario-beats";
import { florenceBeatForTurn } from "./florence";

const metricIds: MetricId[] = ["legitimacy", "economy", "army", "stability", "diplomacy"];

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset * 7919) % items.length];
}

function keywordBias(action: string): Partial<Record<MetricId, number>> {
  const value = action.toLowerCase();
  const result: Partial<Record<MetricId, number>> = {};
  if (/мир|переговор|дипломат|союзник/.test(value)) {
    result.diplomacy = 4;
    result.army = -3;
  }
  if (/земл|крестья|реформ/.test(value)) {
    result.legitimacy = 6;
    result.economy = -2;
  }
  if (/арм|поряд|сил|разгон|арест/.test(value)) {
    result.stability = 5;
    result.legitimacy = -4;
  }
  if (/совет|коалиц|договор/.test(value)) {
    result.legitimacy = 4;
    result.stability = 2;
  }
  if (/налог|банк|промышлен|эконом/.test(value)) {
    result.economy = 5;
    result.legitimacy = -2;
  }
  return result;
}

function nextBriefing(state: GameState, effects: TurnOutcome["effects"], daysPassed: number): string {
  const pressure = effects
    .filter((effect) => effect.delta < 0)
    .sort((a, b) => a.delta - b.delta)[0];
  const opening = daysPassed === 1 ? "На следующий день" : `Через ${daysPassed} дней`;
  const focus: Record<MetricId, string> = {
    legitimacy: "приказ проверяют публичным признанием и правом его оспорить",
    economy: "исполнение упирается в хлеб, топливо и расписание вагонов",
    army: "фронт требует конкретных людей, связи и часов, а не формулировок",
    stability: "улица ждёт не обещаний, а понятного порядка действий",
    diplomacy: "союзники переводят поддержку в новые условия и гарантии",
  };
  const pressureLine = pressure ? focus[pressure.id] : "разные ведомства пытаются превратить решение в собственные инструкции";
  return `${opening} решение выходит из кабинета: ${pressureLine}. Теперь важно не повторить приказ, а увидеть, кто первым возьмёт на себя его исполнение и какую цену потребует этот шаг.`;
}

const trainBeats = [
  {
    headline: "Три списка легли на один стол",
    summary: "Ваш приказ сразу сталкивает три очереди: санитарная бригада требует места для раненых, угольщики считают остаток топлива, а солдатская делегация настаивает на разговоре со штабом. Тимофей Беляев предупреждает: переставить вагоны можно только один раз, иначе состав не пройдёт стрелку до рассвета.",
    nextBriefing: "До отправления остаётся один час. Беляев просит назвать не только приоритет, но и того, чью очередь вы готовы задержать открыто.",
    dispatch: "«У вокзала спорят не о политике, а о том, чей список лежит сверху». — ночная записка дежурного",
    locationId: "nikolaevsky-platform",
    props: ["freight-train", "sealed-decree"],
    atmosphere: "синий предрассветный свет, пар и удары сцепок",
    surprise: "На обороте штабной телеграммы обнаруживается второй маршрут: его дописали карандашом уже после регистрации.",
  },
  {
    headline: "Расписание потребовало свидетеля",
    summary: "Выбранный порядок посадки оказался исполнимым только на бумаге. Один вагон занят носилками, второй заблокирован мешками угля, а делегаты требуют увидеть печать на распоряжении. Лидия Ветрова успела переписать цифры до того, как телеграфист снял ленту.",
    nextBriefing: "Теперь нужно решить, кому показать исходную телеграмму. Её публикация укрепит доверие к списку, но выдаст штабной маршрут тем, кто следит за станцией.",
    dispatch: "«Карандашная помета стала важнее подписи». — сообщение из телеграфной комнаты",
    locationId: "station-telegraph-office",
    props: ["coded-telegram", "field-telephone"],
    atmosphere: "жёлтый свет телеграфной комнаты, щёлканье аппарата и мокрые пальто",
    surprise: "Телеграфист узнаёт собственный почерк на спорной строке, но отказывается назвать, кто попросил её добавить.",
  },
  {
    headline: "Первый вагон оказался переговорной",
    summary: "Пока рабочие затягивали крепления, люди в первом вагоне начали договариваться между собой. Раненые требуют тишины, солдаты — права на остановку, а угольщики предлагают ехать без части багажа. Ваше решение превратило посадку в маленький договор, которого никто не подписывал.",
    nextBriefing: "Состав готов, но машинист ждёт один знак: ехать по короткой ветке с риском остановки или по длинной, где спорные списки увидит штаб.",
    dispatch: "«В вагоне впервые стало ясно: порядок — это тоже чьё-то решение». — запись кондуктора",
    locationId: "freight-carriage",
    props: ["freight-train", "bread-cards"],
    atmosphere: "тесный вагон, копоть под потолком и глухие голоса за стенкой",
    surprise: "Один из мешков с углём промок; запас уменьшается ещё на один участок пути.",
  },
  {
    headline: "Делегация отказалась быть грузом",
    summary: "Солдатский комитет не принял место в хвостовом вагоне и остановил погрузку. Ефим Савельев говорит, что люди готовы уступить места раненым, но не согласны исчезнуть из решения. На платформе впервые звучит не требование, а встречное условие.",
    nextBriefing: "У вас есть десять минут на разговор. Можно дать делегации право голоса, заменить её представителя или отправить поезд без согласия комитета.",
    dispatch: "«Они пришли не за вагоном. Они пришли убедиться, что их ещё считают людьми». — Лидия Ветрова",
    locationId: "nikolaevsky-platform",
    props: ["sealed-decree", "freight-train"],
    atmosphere: "ветер с путей, красный фонарь и плотное кольцо людей у вагона",
    surprise: "Машинист сообщает, что короткая ветка свободна только сейчас; задержка изменит всё расписание на сутки.",
  },
  {
    headline: "Короткая ветка открылась ценой тишины",
    summary: "Поезд получил окно для отправления, но вместе с ним — запрет на остановку в двух узлах. Это экономит уголь и часы, однако лишает вас возможности проверить списки по дороге. Беляев впервые просит не новый приказ, а ваше личное обещание отвечать за последствия.",
    nextBriefing: "Перед стрелкой осталось выбрать: сохранить скорость или остановиться для проверки людей, которых вы уже отправили.",
    dispatch: "«Самый быстрый маршрут — тот, на котором некому задать вопрос». — помета диспетчера",
    locationId: "station-yard",
    props: ["freight-train", "field-telephone"],
    atmosphere: "жёсткий свет прожектора, дым стелется вдоль рельсов",
    surprise: "На соседней линии замечен состав без огней; его маршрут не числится в журнале станции.",
  },
  {
    headline: "Чужая остановка изменила порядок",
    summary: "Незарегистрированный состав занял соседнюю стрелку, и ваш поезд вынужден ждать. За несколько минут люди успевают обменяться местами, письмами и обещаниями. То, что казалось технической задержкой, стало новой расстановкой доверия.",
    nextBriefing: "Пока стрелка занята, можно передать телеграмму наружу или удержать её до прибытия. Второй вариант сохранит тайну, но оставит людей без подтверждения маршрута.",
    dispatch: "«На станции поездов стало два, а времени — вдвое меньше». — отметка сигнальщика",
    locationId: "station-telegraph-office",
    props: ["coded-telegram", "freight-train"],
    atmosphere: "мигающий семафор, пар в низком воздухе и далёкий свист",
    surprise: "Кто-то передал в город неполный список пассажиров; у ворот уже собираются родственники.",
  },
  {
    headline: "Город узнал о тех, кого не взяли",
    summary: "Неполный список превратился в слух. У вокзала появляются люди, чьи имена не попали ни в один вагон, и требуют объяснить порядок. Лидия предлагает опубликовать правду, но Беляев предупреждает: ещё одна остановка — и состав потеряет окно на линии.",
    nextBriefing: "Решение теперь слышит весь перрон. Выберите, что важнее в эти минуты: прозрачность списка, скорость отправления или переговоры с теми, кто остался.",
    dispatch: "«В городе считают не вагоны, а отсутствующих». — экстренный выпуск",
    locationId: "nikolaevsky-platform",
    props: ["bread-cards", "coded-telegram"],
    atmosphere: "серый рассвет, мокрые плакаты и нарастающий гул у ворот",
    surprise: "Среди ожидающих оказывается сестра человека, подписавшего спорную телеграмму.",
  },
  {
    headline: "Состав тронулся не по вашему списку",
    summary: "Последний вагон ушёл после короткого торга между бригадой и солдатским комитетом. В него попали не все, кого вы считали приоритетом, но решение стало видимым и потому — политическим. Беляев передаёт вам копию фактической ведомости: история уже отличается от приказа.",
    nextBriefing: "До первого узла остаётся один перегон. Можно исправить ведомость задним числом, отправить честный отчёт или сохранить версию, которая удержит станцию от нового конфликта.",
    dispatch: "«Поезд отправлен. Теперь спорят уже не о местах, а о том, кто имел право их распределять». — утреннее сообщение",
    locationId: "freight-carriage",
    props: ["freight-train", "sealed-decree"],
    atmosphere: "движение за окном, качка вагона и редкий стук колёс",
    surprise: "Один пассажир передаёт машинисту письмо с просьбой изменить маршрут после первой остановки.",
  },
  {
    headline: "Первый узел сохранил не всех",
    summary: "На первом узле поезд приняли, но часть раненых пришлось оставить для перегрузки. Город получил уголь с опозданием, а делегация добилась права выступить перед штабом. Ни одна линия не победила полностью — зато каждая теперь помнит, как вы распределили время.",
    nextBriefing: "Остался последний выбор хроники: признать неполный результат и назвать тех, кому вы должны, или объявить отправку успехом и закрепить удобную версию.",
    dispatch: "«Состав дошёл. Долг — тоже». — запись в журнале станции",
    locationId: "station-yard",
    props: ["field-telephone", "sealed-decree"],
    atmosphere: "светлеющий двор станции, разогретый металл и редкие голоса",
    surprise: null,
  },
  {
    headline: "Последняя телеграмма осталась у вас",
    summary: "Хроника заканчивается не триумфом, а ведомостью: кто уехал, кто остался и какую цену заплатил город. Ваше решение дало станции порядок на одну ночь, но создало обещания, которые нельзя закрыть одним поездом. В следующем прохождении список можно составить иначе — и мир запомнит это иначе.",
    nextBriefing: "Хроника завершена. Вернитесь к точке разлома, чтобы проверить другой порядок посадки, или продолжите кампанию уже с памятью о том, кого однажды оставили на платформе.",
    dispatch: "«История отправилась первым составом, но не закончилась на конечной». — утренняя передовица",
    locationId: "station-telegraph-office",
    props: ["coded-telegram", "bread-cards"],
    atmosphere: "тихая телеграфная комната после отправления, пыль и утренний свет",
    surprise: null,
  },
] as const;

const trainOptionSets: DecisionOption[][] = [
  lastTrainOptions,
  [
    { id: "train-show-list", title: "Открыть список на платформе", description: "Показать, кто и почему получил место, приняв на себя немедленный гнев тех, кто остался.", risk: "средний", intent: "Открыть полный список посадки на платформе и объяснить порядок публично" },
    { id: "train-seal-route", title: "Сохранить маршрут в тайне", description: "Передать телеграмму только штабу и выиграть время для отправления.", risk: "высокий", intent: "Скрыть маршрут и передать исходную телеграмму только штабу" },
    { id: "train-delegate-voice", title: "Дать делегации слово", description: "Включить солдат в решение и рискнуть последней минутой перед отправлением.", risk: "низкий", intent: "Дать солдатской делегации право выступить перед посадкой" },
  ],
  [
    { id: "train-short-route", title: "Взять короткую ветку", description: "Сэкономить уголь и уйти до рассвета, отказавшись от промежуточной проверки.", risk: "высокий", intent: "Выбрать короткую ветку и отправить состав без промежуточной проверки" },
    { id: "train-long-check", title: "Проверить каждый вагон", description: "Потерять время, но убедиться, что порядок посадки не изменился в пути.", risk: "средний", intent: "Задержать отправление и лично проверить списки в каждом вагоне" },
    { id: "train-ask-driver", title: "Поручить решение машинисту", description: "Передать материальный риск тому, кто знает линию и её сегодняшнее состояние.", risk: "низкий", intent: "Попросить машиниста выбрать безопасный маршрут и письменно принять ответственность" },
  ],
  [
    { id: "train-stop-signal", title: "Остановиться у стрелки", description: "Проверить людей и груз, хотя окно для выхода может закрыться.", risk: "средний", intent: "Остановить состав у стрелки и сверить ведомость с фактическими пассажирами" },
    { id: "train-send-message", title: "Передать телеграмму наружу", description: "Дать городу подтверждение маршрута, но раскрыть наблюдателям ваш план.", risk: "высокий", intent: "Передать в город подтверждённый маршрут и список пассажиров" },
    { id: "train-keep-silence", title: "Не менять приказ", description: "Сохранить единый порядок и не добавлять новых обещаний в спешке.", risk: "низкий", intent: "Не менять приказ и удержать исходный порядок до конечной станции" },
  ],
];

function simulateLastTrainTurn(state: GameState, action: string): TurnOutcome {
  const seed = hash(`${state.id}:${state.turn}:${action}`);
  const value = action.toLowerCase();
  const bias: Partial<Record<MetricId, number>> = {};
  if (/ранен|санитар|леч/.test(value)) { bias.legitimacy = 4; bias.stability = 2; bias.economy = -3; }
  if (/угол|топлив|котел|мастер/.test(value)) { bias.economy = 5; bias.legitimacy = -3; }
  if (/солдат|делегац|комитет|штаб/.test(value)) { bias.army = 4; bias.legitimacy = 3; bias.stability = -2; }
  if (/телег|список|публик|открыт|маршрут/.test(value)) { bias.diplomacy = 3; bias.stability = -2; }
  if (/молч|скры|тайн|не менять/.test(value)) { bias.diplomacy = -2; bias.stability = 3; }

  const effects = metricIds.map((id, index) => {
    const noise = ((seed >> (index * 3)) % 5) - 2;
    const delta = Math.max(-8, Math.min(8, noise + (bias[id] ?? 0)));
    return { id, delta, reason: delta > 2 ? "Люди увидели в приоритете заботу о своей очереди" : delta < -2 ? "Отложенная очередь запомнила цену отправления" : "Эффект пока заметен только на станции" };
  });
  const beat = trainBeats[Math.min(trainBeats.length - 1, Math.max(0, state.turn - 1))];
  const activeCharacterIds = /телег|список|публик|открыт|маршрут/.test(value) || state.turn % 3 === 0
    ? ["rail-belyaev", "lidia-vetrova"]
    : ["rail-belyaev"];
  const propIds = [...beat.props];
  if (/ранен|санитар/.test(value) && !propIds.includes("bread-cards")) propIds.push("bread-cards");
  const optionSet = trainOptionSets[Math.min(trainOptionSets.length - 1, Math.floor(state.turn / 3))] ?? trainOptionSets[0];

  return {
    headline: beat.headline,
    summary: `${beat.summary} Ваш приказ был: «${action}».`,
    nextBriefing: beat.nextBriefing,
    dispatch: beat.dispatch,
    effects,
    reactions: [
      { faction: "Тимофей Беляев", stance: effects.find((effect) => effect.id === "economy")!.delta >= 0 ? "поддержка" : "настороженность", text: "Сверяет не обещание, а фактический тоннаж и минуты до стрелки." },
      { faction: "Лидия Ветрова", stance: effects.find((effect) => effect.id === "diplomacy")!.delta >= 0 ? "поддержка" : "противодействие", text: "Запоминает, кому дали право узнать правду и кого оставили за дверью." },
      { faction: "Солдатский комитет", stance: effects.find((effect) => effect.id === "army")!.delta >= 0 ? "настороженность" : "противодействие", text: "Соглашается на задержку только там, где решение названо вслух." },
    ],
    nextOptions: optionSet.map((option) => ({ ...option, id: `${option.id}-${state.turn}` })),
    daysPassed: 1,
    surprise: seed % 4 === 0 ? null : beat.surprise,
    scene: {
      locationId: beat.locationId,
      activeCharacterIds,
      propIds: propIds.slice(0, 3),
      ambientId: seed % 3 === 0 ? "car-will-not-start" : null,
      atmosphere: beat.atmosphere,
    },
    source: "simulation",
    provider: "simulation",
  };
}

function simulateFlorenceTurn(state: GameState, action: string): TurnOutcome {
  const seed = hash(`${state.id}:${state.turn}:${action}`);
  const value = action.toLowerCase();
  const beat = florenceBeatForTurn(state.turn);
  const care = /джулиан|подмастер|лекар|отдых|сон|ученик/.test(value);
  const practical = /смет|пигмент|краск|картон|договор|аванс|гильди|рассчит|письмен/.test(value);
  const agency = /отказ|не пуск|закры|пауз|не отвеч|останов|сво(ё|е) услов/.test(value);
  const impossible = /без (красок|денег|людей|времени)|сразу законч|магическ|чудес|из воздуха/.test(value);
  const conditional = !impossible && /кардинал|отсроч|аванс|договор|гильди|подпис/.test(value);

  const resolution = impossible
    ? {
        status: "blocked" as const,
        explanation: "В мастерской нет ни материалов, ни людей, чтобы приказ исполнился сам собой.",
        requirement: "Сначала выберите, что меняется в фактах: срок, объём работы, деньги, материалы или число людей.",
        cost: "Потрачено время на невозможное обещание; доверие к следующему объяснению стало ниже.",
      }
    : conditional
      ? {
          status: "conditional" as const,
          explanation: "Ваш замысел реален, но другой человек или институт должны принять встречное условие.",
          requirement: "Кардиналу и гильдии нужны ясные срок, подпись или гарантия оплаты прежде, чем они изменят свои требования.",
          cost: "Пока идёт торг, мастерская платит временем и риском публичного отказа.",
        }
      : {
          status: "executed" as const,
          explanation: "Этот ход можно начать прямо сейчас силами и правами, которые есть у мастерской.",
          cost: care ? "Часть работы и срока вы берёте на себя вместо Джулиано." : agency ? "Вы отказываетесь от удобного чужого условия и принимаете конфликт." : practical ? "Вы тратите время на проверку фактов вместо красивого обещания." : "Ваш выбор меняет то, кому придётся нести следующий риск.",
        };

  const bias: Partial<Record<MetricId, number>> = {};
  if (care) { bias.stability = 5; bias.legitimacy = 3; bias.economy = -3; }
  if (practical) { bias.economy = (bias.economy ?? 0) + 4; bias.diplomacy = 2; }
  if (agency) { bias.legitimacy = (bias.legitimacy ?? 0) + 3; bias.army = -3; bias.diplomacy = (bias.diplomacy ?? 0) - 2; }
  if (conditional) { bias.diplomacy = (bias.diplomacy ?? 0) + 2; bias.stability = (bias.stability ?? 0) - 1; }
  if (impossible) { bias.legitimacy = -5; bias.stability = -3; }

  const effects = metricIds.map((id, index) => {
    const noise = ((seed >> (index * 3)) % 5) - 2;
    const delta = Math.max(-8, Math.min(8, noise + (bias[id] ?? 0)));
    const reason = id === "stability"
      ? delta > 1 ? "Люди получили предел, который можно выдержать" : delta < -1 ? "Нагрузка легла на тех, кто уже почти не держится" : "Силы мастерской пока не успели восстановиться"
      : id === "economy"
        ? delta > 1 ? "Проверка сметы вернула контроль над материалами" : delta < -1 ? "Решение потребовало денег или времени, которых почти нет" : "Цена пока записана в книге, а не оплачена"
        : delta > 1 ? "Ваше условие стало видимым и нашло поддержку" : delta < -1 ? "Другая сторона запомнила, что ей пришлось уступить" : "Последствие ещё проверяется чужим ответом";
    return { id, delta, reason };
  });

  const summary = resolution.status === "blocked"
    ? `Этот приказ не может произойти в нынешних условиях. ${resolution.explanation} ${resolution.requirement}`
    : `${beat.summary} Ваш ход: «${action}». ${resolution.status === "conditional" ? "Мир не отвергает идею, но переносит её в конкретный торг." : "Мастерская начинает исполнять решение немедленно."}`;
  const activeCharacterIds = practical || conditional
    ? ["florence-secretary", "florence-guildmaster"]
    : care ? ["florence-juliano"]
      : agency ? ["florence-cardinal", "florence-juliano"]
        : beat.activeCharacterIds;
  // A completed turn advances to the next pressure point. A blocked order is
  // different: the player needs another chance to change the facts that made
  // it impossible, rather than being silently moved past that constraint.
  const nextBeat = resolution.status === "blocked" ? beat : florenceBeatForTurn(state.turn + 1);
  const nextOptions = nextBeat.options.map((option) => ({ ...option, id: `${option.id}-${state.turn}` }));

  return {
    headline: resolution.status === "blocked" ? "Мастерская остановила невозможный приказ" : beat.headline,
    summary,
    nextBriefing: resolution.status === "blocked"
      ? "Мир ждёт не нового лозунга, а изменения одного из реальных условий: времени, материалов, денег, объёма работы или согласия другого человека."
      : beat.nextBriefing,
    dispatch: beat.dispatch,
    effects,
    reactions: [
      { faction: "Джулиано", stance: care ? "поддержка" : effects.find((effect) => effect.id === "stability")!.delta < 0 ? "противодействие" : "настороженность", text: care ? "Не спорит с вашим решением, но впервые признаёт, что усталость нельзя спрятать за фреской." : "Смотрит не на обещание, а на то, кому достанется ночная работа." },
      { faction: "Гильдия живописцев", stance: effects.find((effect) => effect.id === "army")!.delta >= 0 ? "поддержка" : "настороженность", text: "Признаёт только те условия, которые можно записать в книгу и предъявить заказчику." },
      { faction: "Дом кардинала", stance: effects.find((effect) => effect.id === "diplomacy")!.delta >= 0 ? "настороженность" : "противодействие", text: "Считает не красоту замысла, а сроки, подписи и право потребовать отчёт." },
    ],
    nextOptions,
    daysPassed: 1,
    surprise: resolution.status === "blocked" ? null : seed % 4 === 0 ? null : beat.surprise,
    scene: {
      locationId: beat.locationId,
      activeCharacterIds,
      propIds: beat.propIds,
      ambientId: null,
      atmosphere: beat.atmosphere,
    },
    source: "simulation",
    provider: "simulation",
    resolution,
  };
}

export function simulateTurn(state: GameState, action: string): TurnOutcome {
  if (state.scenarioId === "last-train-1917") return simulateLastTrainTurn(state, action);
  if (state.scenarioId === "florence-workshop") return simulateFlorenceTurn(state, action);
  const seed = hash(`${state.id}:${state.turn}:${action}`);
  const world = worldContextForTurn(state, action);
  const campaignBeat = state.scenarioId === "russia-1917" && state.mode === "campaign"
    ? russia1917CampaignBeatForTurn(state.turn)
    : null;
  const bias = keywordBias(action);
  const effects = metricIds.map((id, index) => {
    const noise = ((seed >> (index * 3)) % 7) - 3;
    const delta = Math.max(-8, Math.min(8, noise + (bias[id] ?? 0)));
    return {
      id,
      delta,
      reason: delta > 2 ? "Решение нашло неожиданную поддержку" : delta < -2 ? "Цена решения оказалась выше ожидаемой" : "Эффект пока ограничен",
    };
  });

  const positive = effects.filter((effect) => effect.delta > 0).length;
  const headline = campaignBeat?.headline ?? pick(
      [
        "Страна проснулась уже в другой реальности",
        "Ваш указ расколол вчерашних союзников",
        "Петроград замер в ожидании ответа",
        "Решение из столицы дошло до фронта",
        "Новый союз возник там, где его не ждали",
      ],
      seed,
    );

  const surprises = [
    "Железнодорожники объявили, что поддержат реформу только после гарантий снабжения городов.",
    "Группа младших офицеров предложила правительству прямой канал связи с солдатскими комитетами.",
    "Из губерний пришли телеграммы: местные советы уже трактуют ваш указ каждый по-своему.",
    "Союзники потребовали письменных гарантий и намекнули на остановку поставок.",
  ];

  const genericOptions: DecisionOption[] = [
    {
      id: `public-${state.turn}`,
      title: "Обратиться к стране напрямую",
      description: "Опубликовать честное объяснение цены решения и потребовать временного мандата доверия.",
      risk: "средний",
      intent: "Обратиться к стране с прямой речью и запросить временный мандат доверия",
    },
    {
      id: `deal-${state.turn}`,
      title: "Закрепить новый союз",
      description: "Превратить ситуативную поддержку одной из сил в формальное соглашение.",
      risk: "низкий",
      intent: "Закрепить поддержку ключевой фракции формальным политическим соглашением",
    },
    {
      id: `double-${state.turn}`,
      title: "Удвоить ставку",
      description: "Не отступать под критикой и расширить решение на всю страну.",
      risk: "высокий",
      intent: `Расширить и ускорить предыдущее решение: ${action}`,
    },
  ];

  const nextOptions = (campaignBeat?.options ?? genericOptions).map((option) => ({ ...option, id: `${option.id}-${state.turn}` }));
  const daysPassed = 7 + (seed % 15);
  return {
    headline,
    summary: campaignBeat
      ? `${campaignBeat.summary} Ваш приказ был: «${action}».`
      : `${action}. Решение немедленно меняет баланс сил: ${positive} из 5 ключевых контуров государства отвечают ростом, остальные требуют платы или времени. История не остановилась, пока кабинет обсуждал детали.`,
    nextBriefing: campaignBeat?.nextBriefing ?? nextBriefing(state, effects, daysPassed),
    dispatch: campaignBeat?.dispatch ?? pick(
        [
          "«Сегодня власть впервые сказала, чего хочет. Но пока никто не знает, сможет ли она это исполнить». — вечерний выпуск",
          "«В столице празднуют победу, в губерниях считают вагоны с хлебом». — телеграмма корреспондента",
          "«Приказ прочитан во всех ротах. Ответ солдат будет известен к утру». — сообщение из Ставки",
        ],
        seed,
        2,
      ),
    effects,
    reactions: [
      { faction: "Петроградский Совет", stance: positive >= 3 ? "поддержка" : "настороженность", text: "Готов обсуждать исполнение, но требует контроля снизу." },
      { faction: "Ставка", stance: effects.find((e) => e.id === "army")!.delta < 0 ? "противодействие" : "настороженность", text: "Оценивает решение прежде всего через состояние фронта." },
      { faction: "Провинция", stance: effects.find((e) => e.id === "legitimacy")!.delta > 0 ? "поддержка" : "настороженность", text: "Ждёт не деклараций, а первых исполнимых распоряжений." },
    ],
    nextOptions,
    daysPassed,
    surprise: seed % 4 === 0 ? null : campaignBeat?.surprise ?? pick(surprises, seed, 4),
    scene: {
      locationId: campaignBeat?.locationId ?? (/поезд|вагон|снабж/i.test(action) ? "muddy-station" : /рабоч|забаст|завод/i.test(action) ? "factory-yard" : "tauride-cabinet"),
      activeCharacterIds: campaignBeat?.activeCharacterIds ?? world.cast.flatMap((character) => character ? [character.id] : []).slice(0, 2),
      propIds: campaignBeat?.propIds ?? world.entityPool.slice(0, 2).map((entity) => entity.id),
      ambientId: seed % 3 === 0 ? world.microEncounters[seed % world.microEncounters.length]?.id ?? null : null,
      atmosphere: campaignBeat?.atmosphere ?? (effects.some((effect) => effect.delta < -5) ? "холодный тревожный свет, дальний гул толпы" : "приглушённый кабинетный свет, слышен телеграф"),
    },
    source: "simulation",
    provider: "simulation",
  };
}

export function applyOutcome(state: GameState, action: string, outcome: TurnOutcome): GameState {
  const date = new Date(`${state.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + outcome.daysPassed);
  const nextDate = date.toISOString().slice(0, 10);
  const metrics = state.metrics.map((metric) => {
    const effect = outcome.effects.find((item) => item.id === metric.id);
    const delta = effect?.delta ?? 0;
    return { ...metric, value: Math.max(0, Math.min(100, metric.value + delta)), trend: delta };
  });
  const weakest = Math.min(...metrics.map((metric) => metric.value));
  const turnLimit = state.scenarioId === "florence-workshop" ? 6 : gameModes[state.mode].turnLimit;
  const status = state.mode === "sandbox"
    ? "active"
    : weakest <= 2
      ? "collapsed"
      : turnLimit !== null && state.turn >= turnLimit
        ? "victory"
        : "active";

  return {
    ...state,
    date: nextDate,
    turn: state.turn + 1,
    status,
    briefing: outcome.nextBriefing ?? `Прошло ${outcome.daysPassed} дней. Решение вышло из кабинета и теперь проверяется исполнением на местах.`,
    metrics,
    options: outcome.nextOptions,
    timeline: [
      ...state.timeline,
      {
        id: `decision-${state.turn}`,
        date: state.date,
        title: `Ваш ход: ${action.slice(0, 72)}`,
        description: outcome.headline,
        kind: "decision",
      },
      ...(outcome.surprise
        ? [{ id: `shock-${state.turn}`, date: nextDate, title: "Непредвиденное последствие", description: outcome.surprise, kind: "shock" as const }]
        : []),
    ],
    lastOutcome: outcome,
    updatedAt: new Date().toISOString(),
  };
}
