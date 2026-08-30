export interface CampaignAct {
  number: number;
  id: "legitimacy" | "promises" | "force" | "inheritance";
  title: string;
  range: string;
  question: string;
  focus: string;
}

/**
 * A compact wayfinding layer for the long campaign. The simulation and the
 * player-facing briefing use the same act boundaries so the player can tell
 * what kind of human choice the current crisis is testing.
 */
export const campaignActs: CampaignAct[] = [
  {
    number: 1,
    id: "legitimacy",
    title: "Власть взаймы",
    range: "ходы 1–7",
    question: "Кто дал вам право приказывать?",
    focus: "создать доверие и первый исполнимый мандат",
  },
  {
    number: 2,
    id: "promises",
    title: "Цена одновременных обещаний",
    range: "ходы 8–16",
    question: "Кому достанется один и тот же вагон?",
    focus: "развести фронт, землю, хлеб и производство",
  },
  {
    number: 3,
    id: "force",
    title: "Кто контролирует силу",
    range: "ходы 17–26",
    question: "Можно ли защитить свободу чрезвычайной властью?",
    focus: "удержать улицу, не создав новую диктатуру",
  },
  {
    number: 4,
    id: "inheritance",
    title: "Государство, которого не было",
    range: "ходы 27+",
    question: "Какой порядок переживёт своих создателей?",
    focus: "превратить временные решения в работающие институты",
  },
];

export function campaignActForTurn(turn: number): CampaignAct {
  const safeTurn = Math.max(1, turn);
  if (safeTurn <= 7) return campaignActs[0];
  if (safeTurn <= 16) return campaignActs[1];
  if (safeTurn <= 26) return campaignActs[2];
  return campaignActs[3];
}
