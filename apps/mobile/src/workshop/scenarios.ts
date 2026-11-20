/** Fictional practice prompts. The stated plan, not a market prediction, determines the answer. */
export const SCENARIOS = [
  {
    id: "fomo",
    skill: "Patience",
    title: "The move you missed.",
    emotion: "Everyone seems to be in. You aren't.",
    situation:
      "A candle races upward while your group chat fills with celebrations. Your practice plan requires a pullback and a written entry reason. Neither has happened.",
    rule: "Wait for the planned setup. Write the reason before acting.",
    options: [
      "Jump in before the next candle.",
      "Wait for the setup in your plan.",
      "Enter a smaller position without a reason.",
    ],
    answer: 1,
    explanation:
      "Waiting follows both conditions in this scenario. A smaller unplanned entry is still unplanned. Missing a move doesn't create an obligation to act.",
    reflection: "What would help you pause when other people seem to be winning?",
  },
  {
    id: "revenge",
    skill: "Reset",
    title: "The urge to win it back.",
    emotion: "Two losses. One very loud impulse.",
    situation:
      "Your paper-trading plan says to stop after two losses and review your notes. You've just taken the second loss. Another chart suddenly looks tempting.",
    rule: "After two losses, end the session and review your notes.",
    options: [
      "Double the next position to recover.",
      "Take one final trade, then stop.",
      "End the session and review the two decisions.",
    ],
    answer: 2,
    explanation:
      "The stop rule was chosen before the pressure arrived. Following it keeps this session consistent with the plan; another trade changes the rule after the outcome.",
    reflection: "Which physical action could mark the end of a difficult session?",
  },
  {
    id: "confidence",
    skill: "Consistency",
    title: "Three wins in a row.",
    emotion: "You're starting to feel unstoppable.",
    situation:
      "Your practice plan fixes position size for the entire session. After three wins, you feel certain the next setup will work. Nothing in your written rules has changed.",
    rule: "Keep the session's position-size rule unchanged.",
    options: [
      "Use the same planned size.",
      "Increase size because you're on a streak.",
      "Skip the checklist just this once.",
    ],
    answer: 0,
    explanation:
      "Keeping the planned size follows the rule. This exercise evaluates consistency, not whether the next trade would win. Confidence alone isn't a change to the plan.",
    reflection: "How would you tell confidence apart from permission to ignore a rule?",
  },
  {
    id: "boredom",
    skill: "Selectivity",
    title: "Nothing is happening.",
    emotion: "You've watched the screen for a while.",
    situation:
      "None of today's simulated setups meets your checklist. Your session rules allow you to finish without taking a trade. You feel that doing nothing means wasting time.",
    rule: "Only act on a setup that meets the checklist. No trade is allowed.",
    options: [
      "Lower the checklist requirements.",
      "Record that no setup qualified and take a break.",
      "Copy a random setup from the chat.",
    ],
    answer: 1,
    explanation:
      "A session with no qualifying setup can end without a trade. The exercise asks you to follow your criteria, not manufacture activity to fill the time.",
    reflection: "What could a productive no-trade session look like for you?",
  },
  {
    id: "outcome",
    skill: "Reflection",
    title: "A good result. A broken rule.",
    emotion: "It worked—but you skipped the plan.",
    situation:
      "An unplanned paper trade ends in a gain. Your review checklist asks you to record whether you followed your rules, separately from the result.",
    rule: "Review the decision process separately from the outcome.",
    options: [
      "Label it a perfect decision because it won.",
      "Remove the checklist because this worked.",
      "Record the gain and the rule you skipped.",
    ],
    answer: 2,
    explanation:
      "Recording both facts is an honest review. A positive outcome doesn't change whether you followed the rule. This practice score is about the process, not profitability.",
    reflection: "Which question would you add to your own post-session review?",
  },
] as const;

export interface DrillState {
  index: number;
  selected: number | null;
  answers: number[];
  revealed: boolean;
  finished: boolean;
}
export const initialDrill: DrillState = {
  index: 0,
  selected: null,
  answers: [],
  revealed: false,
  finished: false,
};
export type DrillAction =
  { type: "select"; option: number } | { type: "confirm" } | { type: "next" } | { type: "restart" };
export function drillReducer(state: DrillState, action: DrillAction): DrillState {
  if (action.type === "restart") return initialDrill;
  if (state.finished) return state;
  if (action.type === "select")
    return state.revealed ||
      action.option < 0 ||
      action.option >= (SCENARIOS[state.index]?.options.length ?? 0)
      ? state
      : { ...state, selected: action.option };
  if (action.type === "confirm")
    return state.selected === null || state.revealed
      ? state
      : { ...state, revealed: true, answers: [...state.answers, state.selected] };
  if (!state.revealed) return state;
  return state.index === SCENARIOS.length - 1
    ? { ...state, finished: true }
    : { ...state, index: state.index + 1, selected: null, revealed: false };
}
export const alignedCount = (answers: number[]) =>
  answers.reduce((n, answer, i) => n + Number(answer === SCENARIOS[i]?.answer), 0);
