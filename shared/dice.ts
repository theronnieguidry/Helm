/**
 * Dice rolling utilities for different tabletop RPG systems
 * 
 * Supported systems:
 * - Polyhedral (D&D 5e, Pathfinder 2e): Roll standard dice, sum results, add modifier
 * - d10 Pool (World of Darkness - Vampire, Werewolf): Count successes, 1s cancel successes, botch detection
 */

export type PolyhedralDie = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export const DIE_MAX: Record<PolyhedralDie, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

export interface PolyhedralRollResult {
  results: number[];
  total: number;
  modifier: number;
  diceType: PolyhedralDie;
  count: number;
  hasCriticalSuccess: boolean;
  hasCriticalFailure: boolean;
}

export interface WoDPoolResult {
  results: number[];
  successes: number;
  ones: number;
  netSuccesses: number;
  isBotch: boolean;
  difficulty: number;
  poolSize: number;
}

/**
 * Roll a single die with the given number of sides
 * @param sides - Number of sides on the die
 * @returns Random number between 1 and sides (inclusive)
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll multiple dice with the given number of sides
 * @param sides - Number of sides on each die
 * @param count - Number of dice to roll
 * @returns Array of roll results
 */
export function rollDice(sides: number, count: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides));
  }
  return results;
}

/**
 * Roll polyhedral dice for D&D/Pathfinder style games
 * 
 * Rules:
 * - Roll the specified number of dice
 * - Sum all results
 * - Add modifier to total
 * - Critical success: rolling max value on a die (e.g., 20 on d20)
 * - Critical failure: rolling 1 on a die
 * 
 * @param diceType - Type of die to roll (d4, d6, d8, d10, d12, d20, d100)
 * @param count - Number of dice to roll
 * @param modifier - Modifier to add to total (can be negative)
 * @param predeterminedResults - Optional predetermined results for testing
 */
export function rollPolyhedral(
  diceType: PolyhedralDie,
  count: number,
  modifier: number = 0,
  predeterminedResults?: number[]
): PolyhedralRollResult {
  const sides = DIE_MAX[diceType];
  const results = predeterminedResults || rollDice(sides, count);
  const sum = results.reduce((a, b) => a + b, 0);
  const total = sum + modifier;
  
  return {
    results,
    total,
    modifier,
    diceType,
    count,
    hasCriticalSuccess: results.some(r => r === sides),
    hasCriticalFailure: results.some(r => r === 1),
  };
}

/**
 * Calculate World of Darkness d10 dice pool results
 * 
 * Rules (Classic World of Darkness - Vampire: The Masquerade, Werewolf: The Apocalypse):
 * - Roll a pool of d10 dice
 * - Each die meeting or exceeding the difficulty is a success
 * - Each 1 rolled cancels one success
 * - Net successes = successes - ones (minimum 0)
 * - BOTCH: When net successes <= 0 AND at least one 1 was rolled
 *   - A botch is a critical failure that typically has negative consequences
 * 
 * Note: 10s are always successes at any difficulty
 * 
 * @param results - Array of d10 roll results (1-10)
 * @param difficulty - Target number for success (typically 3-10, default 6)
 */
export function calculateWoDResults(results: number[], difficulty: number): Omit<WoDPoolResult, 'poolSize'> {
  // Count successes (dice meeting or exceeding difficulty)
  const successes = results.filter(r => r >= difficulty).length;
  
  // Count ones (which cancel successes)
  const ones = results.filter(r => r === 1).length;
  
  // Calculate raw net (can be negative)
  const rawNet = successes - ones;
  
  // Net successes is never negative for display purposes
  const netSuccesses = Math.max(0, rawNet);
  
  // Botch occurs when all successes are canceled by 1s and at least one 1 was rolled
  const isBotch = rawNet <= 0 && ones > 0;
  
  return {
    results,
    successes,
    ones,
    netSuccesses,
    isBotch,
    difficulty,
  };
}

/**
 * Roll a World of Darkness d10 dice pool
 * 
 * @param poolSize - Number of d10 dice to roll
 * @param difficulty - Target number for success (typically 3-10, default 6)
 * @param predeterminedResults - Optional predetermined results for testing
 */
export function rollWoDPool(
  poolSize: number,
  difficulty: number = 6,
  predeterminedResults?: number[]
): WoDPoolResult {
  const results = predeterminedResults || rollDice(10, poolSize);
  const wodResult = calculateWoDResults(results, difficulty);
  
  return {
    ...wodResult,
    poolSize,
  };
}

/**
 * Validate that a difficulty value is valid for WoD
 * @param difficulty - Difficulty value to validate
 * @returns true if valid (1-10)
 */
export function isValidWoDDifficulty(difficulty: number): boolean {
  return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 10;
}

/**
 * Validate that a polyhedral die type is valid
 * @param diceType - Die type to validate
 */
export function isValidPolyhedralDie(diceType: string): diceType is PolyhedralDie {
  return diceType in DIE_MAX;
}
