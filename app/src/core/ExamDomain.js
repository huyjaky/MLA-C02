// The exam files name the four MLA-C01 domains differently (old and new exam-guide wording, some truncated).
// Order matters: only domain 2's names lack the other domains' keywords but all contain "model".
const RULES = [
  [1, /data prep|transform data|feature engineering/i],
  [3, /deploy|orchestration/i],
  [4, /monitor|secur/i],
  [2, /model/i],
]

/** 1..4 for a question's domain name, 0 when it has none (section quizzes are not tagged). */
export const examDomain = (name) => (name && RULES.find(([, pattern]) => pattern.test(name))?.[0]) || 0
