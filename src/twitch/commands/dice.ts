/**
 * Handle !dice command
 * e.g. !dice => 1d6
 * e.g. !dice 1d6 3d4
 */
export function rollDice(comment: string): string {
  const parts = comment.trim().split(/\s+/).slice(1);
  const options = parts.length === 0 ? ["1d6"] : parts;

  const results: string[] = [];

  for (const option of options) {
    const match = option.match(/^(\d+)?d(\d+)$/i);
    if (!match) {
      continue;
    }

    const count = match[1] ? Math.min(Math.max(parseInt(match[1], 10), 1), 100) : 1;
    const sides = Math.max(parseInt(match[2], 10), 1);

    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }

    results.push(`${option} => ${rolls.join(" ")}`);
  }

  if (results.length === 0) {
    return "DiceRoll: 1d6 => " + (Math.floor(Math.random() * 6) + 1);
  }

  return `DiceRoll: ${results.join(", ")}`;
}
