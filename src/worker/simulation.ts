import type { DecisionOption, GameState, MetricId, TurnOutcome } from "../shared/types";
import { campaignActForTurn } from "../shared/campaign";
import { gameModes, worldContextForTurn } from "./world";
import { lastTrainOptions } from "./scenarios";

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

type CampaignBeat = {
  headline: string;
  summary: string;
  nextBriefing: string;
  dispatch: string;
  locationId: string;
  activeCharacterIds: string[];
  propIds: string[];
  atmosphere: string;
  options: DecisionOption[];
  surprise: string;
};

const campaignChoice = (id: string, title: string, description: string, risk: DecisionOption["risk"], intent: string): DecisionOption => ({ id, title, description, risk, intent });

/** Human-scale fallback beats keep the long campaign readable when an AI provider is unavailable. */
const campaignBeats: CampaignBeat[] = [
  {
    headline: "Мандат попросили показать вслух",
    summary: "Совет согласился выслушать кабинет только при условии, что проект указа прочитают не в закрытой комнате. Левицкий понимает: публичность даст приказу исполнителей, но превратит каждую оговорку в обещание перед залом.",
    nextBriefing: "Через два дня зал ждёт текст указа и имя того, кто отвечает за его доставку в губернии. Выберите свидетелей до того, как Совет назначит их сам.",
    dispatch: "«Новый кабинет просит доверия, но пока показывает только печать». — вечерняя газета",
    locationId: "tauride-cabinet",
    activeCharacterIds: ["minister-levitsky", "lidia-vetrova"],
    propIds: ["sealed-decree", "printing-press", "samovar"],
    atmosphere: "медный свет кабинета, шорох бумаги и гул за дверью",
    options: [
      campaignChoice("campaign-publish-mandate", "Опубликовать проект", "Отдать текст печатне до обсуждения и принять риск преждевременной критики.", "средний", "Опубликовать проект указа до заседания и принять публичную критику формулировок"),
      campaignChoice("campaign-private-signatures", "Собрать подписи тихо", "Закрепить поддержку министров и Совета, прежде чем выносить спорные пункты наружу.", "низкий", "Сначала собрать подписи министров и представителей Совета, а затем объявить указ"),
      campaignChoice("campaign-delegate-choice", "Назначить исполнителя", "Передать ответственность одному человеку и проверить, выдержит ли он давление на местах.", "высокий", "Назначить одного ответственного исполнителя указа и дать ему ограниченный мандат"),
    ],
    surprise: "Корректор находит в отпечатанном тексте старую формулу о чрезвычайных полномочиях; неизвестно, кто вернул её в набор.",
  },
  {
    headline: "Приказу не хватило исполнителя",
    summary: "Распоряжение о временном порядке прошло кабинет, но застряло между Ставкой и городской управой. Аргунов принёс карту каналов связи: каждый маршрут уже занят чужой срочностью, а Левицкий не хочет поручать армию человеку без гражданского мандата.",
    nextBriefing: "К утру нужно выбрать канал доставки и того, кто сможет оспорить приказ на месте. Молчаливое согласие даст скорость, но не даст вам свидетеля исполнения.",
    dispatch: "«Указ дошёл до станции раньше, чем до губернии». — записка из Ставки",
    locationId: "tauride-cabinet",
    activeCharacterIds: ["colonel-argunov", "minister-levitsky"],
    propIds: ["field-telephone", "sealed-decree"],
    atmosphere: "ночной кабинет, потрескивание телефона и карта под тяжёлым стеклом",
    options: [
      campaignChoice("campaign-army-channel", "Отправить через Ставку", "Использовать армейскую сеть и признать её временным гарантом порядка.", "высокий", "Передать указ через армейскую сеть и временно поручить Ставке его исполнение"),
      campaignChoice("campaign-civilian-courier", "Выслать гражданского курьера", "Сохранить гражданский контроль, потеряв несколько дней на дорогу.", "средний", "Выслать гражданского курьера с копией указа и правом остановить его исполнение"),
      campaignChoice("campaign-open-channel", "Открыть линию Совету", "Дать представителям Совета самим подтвердить текст на местах.", "низкий", "Открыть линию связи с Советами и поручить им подтвердить текст указа на местах"),
    ],
    surprise: "На запасной линии отвечает уездный оператор, который получил приказ от неизвестного комитета раньше столичного текста.",
  },
  {
    headline: "Провинция прочитала иначе",
    summary: "Из трёх губерний пришли разные толкования одного пункта: где-то начали выдавать хлеб по новым карточкам, где-то остановили выдачу вовсе. Анна Новикова приносит список смен и просит не наказывать тех, кто исполнил только понятную часть приказа.",
    nextBriefing: "Через неделю вы получите первые цифры исполнения. Нужно решить, исправлять ли трактовки сверху или дать местным комитетам довести правила до рабочего вида.",
    dispatch: "«Временное правительство говорит одним голосом, губернии слышат три». — телеграмма корреспондента",
    locationId: "factory-yard",
    activeCharacterIds: ["worker-novikova", "minister-levitsky"],
    propIds: ["bread-cards", "coded-telegram", "printing-press"],
    atmosphere: "дымный двор фабрики, звон сменного колокола и мокрые объявления",
    options: [
      campaignChoice("campaign-central-clarification", "Уточнить циркуляром", "Вернуть единый текст и задержать локальные решения.", "средний", "Выпустить единый циркуляр с уточнением спорных пунктов и приостановить местные трактовки"),
      campaignChoice("campaign-local-boards", "Оставить доскам право решения", "Признать разницу правил и потребовать только прозрачного отчёта.", "низкий", "Оставить местным комитетам право уточнять правила при обязательном открытом отчёте"),
      campaignChoice("campaign-inspectors", "Послать инспекторов", "Проверить выдачу на месте, рискуя превратить проверку в карательную акцию.", "высокий", "Послать гражданских инспекторов на фабрики и отменить распоряжения, нарушающие карточный порядок"),
    ],
    surprise: "Анна находит в списках смен фамилии людей, которых официально уже отправили на фронт; кто-то подменяет рабочие голоса.",
  },
  {
    headline: "Один вагон на четыре обещания",
    summary: "Коалиция потребовала один и тот же товарный вагон: хлебу, углю, фронту и фабрике. Софья Воронцова предлагает контракт с понятной очередью, Анна Новикова отвечает, что контракт без участия рабочих станет новой формой приказа.",
    nextBriefing: "На рассвете Беляев закроет ведомость. Вам нужно выбрать принцип очереди, а не только груз, который сегодня кажется самым громким.",
    dispatch: "«Вагон стал конституцией: каждый пункт обещает больше, чем может вместить». — листок у станции",
    locationId: "factory-yard",
    activeCharacterIds: ["industrialist-vorontsova", "worker-novikova"],
    propIds: ["freight-train", "bread-cards", "samovar"],
    atmosphere: "оранжевый свет цеха, пар от котлов и очередь у ворот",
    options: [
      campaignChoice("campaign-food-first", "Отдать хлебу", "Накормить город сейчас и объяснить фронту задержку снабжения.", "средний", "Отдать товарный вагон хлебу для города и письменно объяснить задержку фронту"),
      campaignChoice("campaign-contract-queue", "Ввести общую очередь", "Закрепить пропорцию для всех четырёх требований.", "низкий", "Ввести прозрачную общую очередь для хлеба, угля, фронта и фабрик"),
      campaignChoice("campaign-worker-control", "Передать контроль смене", "Дать рабочим проверять погрузку, рискуя остановить отправление спором о цифрах.", "высокий", "Передать рабочей комиссии контроль над погрузкой и обязать её подписать ведомость"),
    ],
    surprise: "В ведомости обнаруживается пустая строка для вагона, который уже получил частный номер маршрута.",
  },
  {
    headline: "Ставка потребовала доказательств",
    summary: "Аргунов согласен на новую систему снабжения только после проверки первого состава. Беляев предупреждает: инспекция задержит отправление, но без неё армейский штаб объявит гражданский контроль фикцией.",
    nextBriefing: "У вас одна ночь до отправки. Выберите, кто имеет право открыть вагон и что станет доказательством, если цифры снова разойдутся.",
    dispatch: "«Ставка верит не министерству, а вскрытому пломбиром вагону». — донесение железнодорожников",
    locationId: "muddy-station",
    activeCharacterIds: ["colonel-argunov", "rail-belyaev"],
    propIds: ["field-telephone", "freight-train", "sealed-decree"],
    atmosphere: "грязный перрон, белый пар и короткие сигналы семафора",
    options: [
      campaignChoice("campaign-open-inspection", "Открыть вагон публично", "Показать груз всем сторонам и потерять окно отправления.", "средний", "Открыть вагон для публичной проверки представителями Ставки, Совета и железной дороги"),
      campaignChoice("campaign-military-seal", "Оставить армейскую пломбу", "Сохранить скорость, поручив Ставке проверку по прибытии.", "высокий", "Оставить армейскую пломбу и отправить состав немедленно под ответственность Ставки"),
      campaignChoice("campaign-railway-witness", "Поручить Беляеву", "Сделать технического служащего независимым свидетелем.", "низкий", "Поручить Беляеву подписать независимую ведомость и сделать её доступной всем фракциям"),
    ],
    surprise: "У пломбы два одинаковых номера; один зарегистрирован на станции, которая давно не работает.",
  },
  {
    headline: "Броневик стал аргументом",
    summary: "У площади остановился броневик без ясного приказа. Аргунов требует выставить кордон, Лидия Ветрова уже видит, как фотография машины превращается в доказательство мнимого переворота.",
    nextBriefing: "До вечера нужно назвать законное основание присутствия силы. Оставить машину — значит принять страх, убрать — признать, что приказы больше не доходят.",
    dispatch: "«На площади было всего одно орудие, но слух уже насчитал батальон». — вечерний выпуск",
    locationId: "muddy-station",
    activeCharacterIds: ["colonel-argunov", "lidia-vetrova"],
    propIds: ["armored-car", "coded-telegram", "sealed-decree"],
    atmosphere: "серый дождь, мотор на холостом ходу и крики у ограды",
    options: [
      campaignChoice("campaign-armored-cordon", "Поставить кордон", "Вернуть порядок силой и ограничить его срок.", "высокий", "Поставить временный кордон броневиками и публично ограничить его срок"),
      campaignChoice("campaign-civilian-observer", "Пригласить наблюдателей", "Допустить Совет и журналистов к проверке приказа.", "средний", "Оставить броневик на площади и пригласить Совет и журналистов проверить приказ"),
      campaignChoice("campaign-withdraw-force", "Увести броневик", "Убрать символ силы и поручить порядок городской страже.", "низкий", "Увести броневик и передать порядок на площади городской страже"),
    ],
    surprise: "Водитель показывает приказ с вашей подписью, но дата на нём завтрашняя.",
  },
  {
    headline: "Типография попросила границу",
    summary: "Редактор готов напечатать стенограмму заседания, если кабинет назовёт пределы цензуры до выпуска. Лидия настаивает на полном тексте, Анна — на том, чтобы в нём не потерялись фамилии рабочих.",
    nextBriefing: "Ночной набор начнётся через час. Определите, что нельзя вырезать из публичной памяти, даже если это усилит противников.",
    dispatch: "«Газета не решает спор, но решает, каким голосом его услышат». — редакционная помета",
    locationId: "factory-yard",
    activeCharacterIds: ["lidia-vetrova", "worker-novikova"],
    propIds: ["printing-press", "bread-cards", "coded-telegram"],
    atmosphere: "жёлтый свет типографии, ритм пресса и запах свежей краски",
    options: [
      campaignChoice("campaign-full-transcript", "Напечатать всё", "Сохранить стенограмму целиком и принять политический удар.", "высокий", "Напечатать полную стенограмму заседания без вырезок и комментариев кабинета"),
      campaignChoice("campaign-names-only", "Сохранить фамилии", "Скрыть оперативные детали, но не стирать людей из документа.", "средний", "Опубликовать стенограмму с закрытыми оперативными деталями, сохранив все фамилии"),
      campaignChoice("campaign-delay-issue", "Отложить выпуск", "Проверить источник и дать противникам назвать это цензурой.", "низкий", "Отложить выпуск до проверки источника и публично объяснить причину задержки"),
    ],
    surprise: "В наборе уже лежит заголовок о падении правительства, хотя заседание ещё не закончилось.",
  },
  {
    headline: "Институт пережил кабинет",
    summary: "Рабочая комиссия и железнодорожная сеть продолжают действовать, хотя министры снова спорят о полномочиях. Анна и Софья впервые приходят с одним предложением: оставить им право самим опубликовать ведомость, если кабинет не успеет.",
    nextBriefing: "Последняя проверка кампании — кто сможет действовать без вашего имени. Передайте один рычаг, оставьте его у себя или разделите между двумя сторонами.",
    dispatch: "«Правительство меняет вывески. Ведомость помнит только тех, кто поставил подпись». — утренний выпуск",
    locationId: "factory-yard",
    activeCharacterIds: ["worker-novikova", "industrialist-vorontsova"],
    propIds: ["printing-press", "freight-train", "sealed-decree"],
    atmosphere: "мягкий рассвет над фабричным двором, скрип пресса и далёкий гудок",
    options: [
      campaignChoice("campaign-independent-ledger", "Передать ведомость комиссии", "Сделать институт самостоятельным и принять потерю личного контроля.", "средний", "Передать независимой комиссии право публиковать ведомость без согласования кабинета"),
      campaignChoice("campaign-keep-signature", "Оставить подпись себе", "Сохранить ответственность в кабинете и зависимость системы от одного имени.", "высокий", "Оставить право последней подписи у кабинета и лично отвечать за каждую ведомость"),
      campaignChoice("campaign-shared-control", "Разделить подпись", "Создать медленный, но живучий контроль двух сторон.", "низкий", "Разделить право подписи между рабочей комиссией и представителем производства"),
    ],
    surprise: "Первая самостоятельная ведомость комиссии не совпадает с архивной копией, но объясняет каждую разницу.",
  },
];

function campaignBeatForTurn(turn: number): CampaignBeat {
  const safeTurn = Math.max(1, turn);
  const act = campaignActForTurn(safeTurn);
  const actStarts = [1, 8, 17, 27];
  const start = actStarts[act.number - 1] ?? 1;
  const offsetsByAct = [
    Math.min(2, Math.floor((safeTurn - start) / 3)),
    Math.min(1, Math.floor((safeTurn - start) / 5)),
    Math.min(1, Math.floor((safeTurn - start) / 5)),
    1,
  ];
  const indexByAct = [0, 3, 5, 7];
  const index = Math.min(campaignBeats.length - 1, (indexByAct[act.number - 1] ?? 0) + (offsetsByAct[act.number - 1] ?? 0));
  return campaignBeats[index];
}

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

export function simulateTurn(state: GameState, action: string): TurnOutcome {
  if (state.scenarioId === "last-train-1917") return simulateLastTrainTurn(state, action);
  const seed = hash(`${state.id}:${state.turn}:${action}`);
  const world = worldContextForTurn(state, action);
  const campaignBeat = state.scenarioId === "russia-1917" && state.mode === "campaign"
    ? campaignBeatForTurn(state.turn)
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
  const turnLimit = gameModes[state.mode].turnLimit;
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
