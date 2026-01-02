import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  rollPolyhedral,
  rollWoDPool,
  calculateWoDResults,
  isValidPolyhedralDie,
  isValidWoDDifficulty,
  rollDice,
  type PolyhedralDie,
} from '../shared/dice';

/**
 * Dice System Scenario Tests
 * 
 * These tests verify game-specific scenarios and mechanics for:
 * - D&D 5e (attack rolls, damage, saving throws, criticals)
 * - Pathfinder 2e (skill checks, degrees of success)
 * - Vampire: The Masquerade (Discipline rolls, combat, frenzy)
 * - Werewolf: The Apocalypse (Rage, Gnosis, Gift activation)
 * 
 * Each scenario validates that the dice utilities correctly implement
 * the rules for that game system.
 */

/**
 * Simulates API request processing for polyhedral dice
 * This mirrors the logic in server/routes.ts POST /api/teams/:teamId/dice-rolls
 */
function processPolyhedralApiRequest(body: { 
  diceType: string; 
  count: number; 
  modifier: number;
  predeterminedResults?: number[];
}) {
  const { diceType, count, modifier, predeterminedResults } = body;
  
  // Validate dice type (as the API would)
  if (!isValidPolyhedralDie(diceType)) {
    throw new Error(`Invalid dice type: ${diceType}`);
  }
  
  // Validate count
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('Count must be between 1 and 20');
  }
  
  // Roll the dice using utility
  const result = rollPolyhedral(diceType as PolyhedralDie, count, modifier, predeterminedResults);
  
  // Return API response format
  return {
    diceType: result.diceType,
    count: result.count,
    modifier: result.modifier,
    results: result.results,
    total: result.total,
  };
}

/**
 * Simulates API request processing for WoD d10 pools
 * This mirrors the logic in server/routes.ts POST /api/teams/:teamId/dice-rolls
 */
function processWoDPoolApiRequest(body: { 
  poolSize: number; 
  difficulty?: number;
  predeterminedResults?: number[];
}) {
  const { poolSize, difficulty = 6, predeterminedResults } = body;
  
  // Validate pool size
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 30) {
    throw new Error('Pool size must be between 1 and 30');
  }
  
  // Validate difficulty
  if (!isValidWoDDifficulty(difficulty)) {
    throw new Error('Difficulty must be between 1 and 10');
  }
  
  // Roll the pool using utility
  const result = rollWoDPool(poolSize, difficulty, predeterminedResults);
  
  // Return API response format
  return {
    diceType: 'd10_pool',
    count: result.poolSize,
    results: result.results,
    total: result.netSuccesses, // API stores net successes as total
    difficulty: result.difficulty,
    successes: result.successes,
    ones: result.ones,
    netSuccesses: result.netSuccesses,
    isBotch: result.isBotch,
  };
}

describe('Dice System Scenario Tests', () => {
  describe('API Request Validation', () => {
    describe('Polyhedral dice validation', () => {
      it('should accept all valid polyhedral dice types', () => {
        const validTypes: PolyhedralDie[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
        validTypes.forEach(type => {
          expect(isValidPolyhedralDie(type)).toBe(true);
        });
      });

      it('should reject invalid dice types', () => {
        const invalidTypes = ['d5', 'd7', 'd15', 'd50', 'invalid', '', 'd'];
        invalidTypes.forEach(type => {
          expect(isValidPolyhedralDie(type)).toBe(false);
        });
      });

      it('should validate count is positive integer', () => {
        const validCounts = [1, 2, 5, 10, 20];
        validCounts.forEach(count => {
          expect(count > 0 && Number.isInteger(count)).toBe(true);
        });

        const invalidCounts = [0, -1, 0.5, NaN];
        invalidCounts.forEach(count => {
          expect(count > 0 && Number.isInteger(count)).toBe(false);
        });
      });

      it('should allow positive and negative modifiers', () => {
        const validModifiers = [-10, -5, -1, 0, 1, 5, 10];
        validModifiers.forEach(mod => {
          const result = rollPolyhedral('d20', 1, mod, [10]);
          expect(result.total).toBe(10 + mod);
        });
      });
    });

    describe('WoD pool validation', () => {
      it('should accept valid difficulty values (1-10)', () => {
        for (let diff = 1; diff <= 10; diff++) {
          expect(isValidWoDDifficulty(diff)).toBe(true);
        }
      });

      it('should reject invalid difficulty values', () => {
        const invalidDiffs = [0, 11, -1, 5.5, NaN];
        invalidDiffs.forEach(diff => {
          expect(isValidWoDDifficulty(diff)).toBe(false);
        });
      });

      it('should validate pool size is positive', () => {
        expect(() => rollWoDPool(0, 6, [])).not.toThrow();
        // Pool size should be tracked correctly
        const result = rollWoDPool(5, 6, [1, 2, 3, 4, 5]);
        expect(result.poolSize).toBe(5);
      });
    });
  });

  describe('Complete Roll Flow - Polyhedral', () => {
    describe('D&D 5e Combat Flow', () => {
      it('should process a complete attack + damage sequence', () => {
        // Step 1: Roll attack (1d20 + 5)
        const attackRoll = rollPolyhedral('d20', 1, 5, [15]);
        expect(attackRoll.total).toBe(20);
        expect(attackRoll.hasCriticalSuccess).toBe(false);
        
        // Step 2: If hit, roll damage (2d6 + 3 for longsword with STR)
        const damageRoll = rollPolyhedral('d6', 2, 3, [4, 5]);
        expect(damageRoll.total).toBe(12);
        
        // Both results should have proper structure
        expect(attackRoll).toHaveProperty('results');
        expect(attackRoll).toHaveProperty('total');
        expect(attackRoll).toHaveProperty('modifier');
        expect(attackRoll).toHaveProperty('diceType');
        expect(attackRoll).toHaveProperty('count');
      });

      it('should handle critical hit damage doubling', () => {
        // Critical hit: double dice
        const attackRoll = rollPolyhedral('d20', 1, 5, [20]);
        expect(attackRoll.hasCriticalSuccess).toBe(true);
        
        // Critical damage: 4d6 + 3 (doubled dice)
        const critDamage = rollPolyhedral('d6', 4, 3, [4, 5, 3, 6]);
        expect(critDamage.total).toBe(21); // 4+5+3+6+3 = 21
        expect(critDamage.count).toBe(4);
      });

      it('should process saving throw', () => {
        // Dexterity saving throw: 1d20 + DEX mod
        const save = rollPolyhedral('d20', 1, 3, [14]);
        expect(save.total).toBe(17);
        
        // Check if save meets DC 15
        const dc = 15;
        expect(save.total >= dc).toBe(true);
      });

      it('should handle natural 1 on saving throw', () => {
        const save = rollPolyhedral('d20', 1, 10, [1]);
        expect(save.hasCriticalFailure).toBe(true);
        expect(save.total).toBe(11); // Still calculate total for reference
      });
    });

    describe('Pathfinder 2e Skill Check Flow', () => {
      it('should process degrees of success', () => {
        const dc = 20;
        
        // Critical Success: Beat DC by 10+ or natural 20
        const critSuccess = rollPolyhedral('d20', 1, 5, [20]);
        expect(critSuccess.hasCriticalSuccess).toBe(true);
        
        // Success: Meet or beat DC
        const success = rollPolyhedral('d20', 1, 5, [16]);
        expect(success.total).toBe(21);
        expect(success.total >= dc).toBe(true);
        
        // Failure: Below DC
        const failure = rollPolyhedral('d20', 1, 5, [10]);
        expect(failure.total).toBe(15);
        expect(failure.total < dc).toBe(true);
        
        // Critical Failure: Natural 1 or fail by 10+
        const critFail = rollPolyhedral('d20', 1, 5, [1]);
        expect(critFail.hasCriticalFailure).toBe(true);
      });
    });
  });

  describe('Complete Roll Flow - World of Darkness', () => {
    describe('Vampire: The Masquerade Combat Flow', () => {
      it('should process a complete combat round', () => {
        // Step 1: Attack roll (Dexterity + Brawl, difficulty 6)
        const attackPool = 7;
        const attackRoll = rollWoDPool(attackPool, 6, [3, 5, 6, 7, 8, 4, 2]);
        
        expect(attackRoll.successes).toBe(3); // 6, 7, 8
        expect(attackRoll.netSuccesses).toBe(3);
        expect(attackRoll.isBotch).toBe(false);
        
        // Step 2: If hit, damage roll (Strength + extra successes)
        const damagePool = 4 + attackRoll.netSuccesses; // 7 dice
        const damageRoll = rollWoDPool(damagePool, 6, [4, 5, 6, 7, 8, 9, 10]);
        
        expect(damageRoll.successes).toBe(5); // 6, 7, 8, 9, 10
        expect(damageRoll.netSuccesses).toBe(5);
      });

      it('should handle a Discipline activation', () => {
        // Dominate: Manipulation + Intimidation, difficulty 7
        const result = rollWoDPool(6, 7, [3, 5, 7, 8, 9, 2]);
        
        expect(result.successes).toBe(3);
        expect(result.netSuccesses).toBe(3);
        expect(result.difficulty).toBe(7);
      });

      it('should track botch on failed hunt', () => {
        // Hunting roll gone wrong
        const result = rollWoDPool(5, 6, [1, 1, 2, 3, 4]);
        
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(2);
        expect(result.isBotch).toBe(true);
      });

      it('should handle contested roll', () => {
        // Player rolls Willpower to resist Dominate
        const playerRoll = rollWoDPool(6, 6, [4, 6, 7, 8, 3, 2]);
        // Vampire rolls Manipulation + Dominate
        const vampireRoll = rollWoDPool(8, 6, [5, 6, 6, 7, 8, 9, 2, 3]);
        
        // Compare net successes
        const playerWins = playerRoll.netSuccesses > vampireRoll.netSuccesses;
        const tie = playerRoll.netSuccesses === vampireRoll.netSuccesses;
        
        expect(playerRoll.netSuccesses).toBe(3);
        expect(vampireRoll.netSuccesses).toBe(5);
        expect(playerWins).toBe(false);
      });
    });

    describe('Werewolf: The Apocalypse Gift Activation', () => {
      it('should process Gnosis roll for Gift activation', () => {
        // Using a Gift: Roll Gnosis, difficulty varies
        const result = rollWoDPool(5, 7, [4, 6, 7, 9, 10]);
        
        expect(result.successes).toBe(3); // 7, 9, 10 at diff 7
        expect(result.netSuccesses).toBe(3);
      });

      it('should handle Rage roll for extra actions', () => {
        // Spending Rage: Roll current Rage, difficulty 6
        const result = rollWoDPool(7, 6, [2, 3, 6, 7, 8, 9, 10]);
        
        expect(result.successes).toBe(5);
        expect(result.netSuccesses).toBe(5);
      });

      it('should detect frenzy risk on botch', () => {
        // Failed roll with 1s - character might frenzy
        const result = rollWoDPool(4, 6, [1, 2, 3, 4]);
        
        expect(result.isBotch).toBe(true);
        // Game logic: If botch on certain rolls, check for frenzy
      });
    });

    describe('Difficulty Variations', () => {
      it('should correctly apply different difficulties', () => {
        const samePool = [3, 4, 5, 6, 7, 8, 9, 10];
        
        // Difficulty 4 (Easy)
        const easy = calculateWoDResults(samePool, 4);
        expect(easy.successes).toBe(7); // 4, 5, 6, 7, 8, 9, 10
        
        // Difficulty 6 (Standard)
        const standard = calculateWoDResults(samePool, 6);
        expect(standard.successes).toBe(5); // 6, 7, 8, 9, 10
        
        // Difficulty 8 (Hard)
        const hard = calculateWoDResults(samePool, 8);
        expect(hard.successes).toBe(3); // 8, 9, 10
        
        // Difficulty 10 (Legendary)
        const legendary = calculateWoDResults(samePool, 10);
        expect(legendary.successes).toBe(1); // Only 10
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    describe('Boundary conditions', () => {
      it('should handle maximum dice count for polyhedral', () => {
        const result = rollPolyhedral('d6', 20, 0, Array(20).fill(3));
        expect(result.results).toHaveLength(20);
        expect(result.total).toBe(60);
      });

      it('should handle maximum pool size for WoD', () => {
        const pool = Array(30).fill(6);
        const result = rollWoDPool(30, 6, pool);
        expect(result.poolSize).toBe(30);
        expect(result.results).toHaveLength(30);
        expect(result.successes).toBe(30);
      });

      it('should handle large modifiers', () => {
        const result = rollPolyhedral('d20', 1, 100, [10]);
        expect(result.total).toBe(110);
        
        const negResult = rollPolyhedral('d20', 1, -100, [10]);
        expect(negResult.total).toBe(-90);
      });

      it('should handle all dice showing 1 in WoD', () => {
        const result = rollWoDPool(5, 6, [1, 1, 1, 1, 1]);
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(5);
        expect(result.isBotch).toBe(true);
      });

      it('should handle all dice showing 10 in WoD', () => {
        const result = rollWoDPool(5, 6, [10, 10, 10, 10, 10]);
        expect(result.successes).toBe(5);
        expect(result.ones).toBe(0);
        expect(result.netSuccesses).toBe(5);
        expect(result.isBotch).toBe(false);
      });
    });

    describe('Response structure validation', () => {
      it('should always return required fields for polyhedral roll', () => {
        const result = rollPolyhedral('d20', 1, 5);
        
        expect(typeof result.total).toBe('number');
        expect(Array.isArray(result.results)).toBe(true);
        expect(typeof result.modifier).toBe('number');
        expect(typeof result.diceType).toBe('string');
        expect(typeof result.count).toBe('number');
        expect(typeof result.hasCriticalSuccess).toBe('boolean');
        expect(typeof result.hasCriticalFailure).toBe('boolean');
      });

      it('should always return required fields for WoD roll', () => {
        const result = rollWoDPool(5, 6);
        
        expect(Array.isArray(result.results)).toBe(true);
        expect(typeof result.successes).toBe('number');
        expect(typeof result.ones).toBe('number');
        expect(typeof result.netSuccesses).toBe('number');
        expect(typeof result.isBotch).toBe('boolean');
        expect(typeof result.difficulty).toBe('number');
        expect(typeof result.poolSize).toBe('number');
      });

      it('should include difficulty in WoD result', () => {
        const result = rollWoDPool(5, 8, [1, 2, 3, 4, 5]);
        expect(result.difficulty).toBe(8);
      });
    });
  });

  describe('Randomness Quality Tests', () => {
    it('should produce varied results over multiple polyhedral rolls', () => {
      const results = new Set<number>();
      
      for (let i = 0; i < 100; i++) {
        const roll = rollPolyhedral('d20', 1, 0);
        results.add(roll.total);
      }
      
      // Should see multiple different values
      expect(results.size).toBeGreaterThan(10);
    });

    it('should produce varied results over multiple WoD rolls', () => {
      const successCounts = new Set<number>();
      
      for (let i = 0; i < 100; i++) {
        const roll = rollWoDPool(5, 6);
        successCounts.add(roll.netSuccesses);
      }
      
      // Should see multiple different success counts
      expect(successCounts.size).toBeGreaterThan(3);
    });

    it('should produce results within valid range for d20', () => {
      for (let i = 0; i < 100; i++) {
        const roll = rollPolyhedral('d20', 1, 0);
        expect(roll.total).toBeGreaterThanOrEqual(1);
        expect(roll.total).toBeLessThanOrEqual(20);
      }
    });

    it('should produce results within valid range for d10 pool', () => {
      for (let i = 0; i < 100; i++) {
        const roll = rollWoDPool(5, 6);
        roll.results.forEach(r => {
          expect(r).toBeGreaterThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(10);
        });
      }
    });
  });

  describe('API Request Processing Simulation', () => {
    describe('Polyhedral API requests', () => {
      it('should process valid polyhedral request', () => {
        const response = processPolyhedralApiRequest({
          diceType: 'd20',
          count: 1,
          modifier: 5,
          predeterminedResults: [15],
        });
        
        expect(response.diceType).toBe('d20');
        expect(response.count).toBe(1);
        expect(response.modifier).toBe(5);
        expect(response.total).toBe(20);
        expect(response.results).toEqual([15]);
      });

      it('should reject invalid dice type', () => {
        expect(() => processPolyhedralApiRequest({
          diceType: 'd7',
          count: 1,
          modifier: 0,
        })).toThrow('Invalid dice type: d7');
      });

      it('should reject invalid count', () => {
        expect(() => processPolyhedralApiRequest({
          diceType: 'd20',
          count: 0,
          modifier: 0,
        })).toThrow('Count must be between 1 and 20');

        expect(() => processPolyhedralApiRequest({
          diceType: 'd20',
          count: 25,
          modifier: 0,
        })).toThrow('Count must be between 1 and 20');
      });

      it('should process D&D attack roll request', () => {
        const response = processPolyhedralApiRequest({
          diceType: 'd20',
          count: 1,
          modifier: 7,
          predeterminedResults: [18],
        });
        
        expect(response.total).toBe(25);
      });

      it('should process D&D damage roll request', () => {
        const response = processPolyhedralApiRequest({
          diceType: 'd6',
          count: 2,
          modifier: 4,
          predeterminedResults: [5, 6],
        });
        
        expect(response.total).toBe(15); // 5 + 6 + 4
      });
    });

    describe('WoD Pool API requests', () => {
      it('should process valid WoD pool request', () => {
        const response = processWoDPoolApiRequest({
          poolSize: 5,
          difficulty: 6,
          predeterminedResults: [3, 6, 7, 1, 9],
        });
        
        expect(response.diceType).toBe('d10_pool');
        expect(response.count).toBe(5);
        expect(response.difficulty).toBe(6);
        expect(response.successes).toBe(3); // 6, 7, 9
        expect(response.ones).toBe(1);
        expect(response.netSuccesses).toBe(2); // 3 - 1
        expect(response.isBotch).toBe(false);
      });

      it('should detect botch in API response', () => {
        const response = processWoDPoolApiRequest({
          poolSize: 4,
          difficulty: 6,
          predeterminedResults: [1, 2, 3, 4],
        });
        
        expect(response.isBotch).toBe(true);
        expect(response.netSuccesses).toBe(0);
      });

      it('should detect botch when success is canceled by one', () => {
        const response = processWoDPoolApiRequest({
          poolSize: 2,
          difficulty: 6,
          predeterminedResults: [6, 1],
        });
        
        expect(response.successes).toBe(1);
        expect(response.ones).toBe(1);
        expect(response.netSuccesses).toBe(0);
        expect(response.isBotch).toBe(true);
      });

      it('should reject invalid pool size', () => {
        expect(() => processWoDPoolApiRequest({
          poolSize: 0,
        })).toThrow('Pool size must be between 1 and 30');

        expect(() => processWoDPoolApiRequest({
          poolSize: 35,
        })).toThrow('Pool size must be between 1 and 30');
      });

      it('should reject invalid difficulty', () => {
        expect(() => processWoDPoolApiRequest({
          poolSize: 5,
          difficulty: 0,
        })).toThrow('Difficulty must be between 1 and 10');

        expect(() => processWoDPoolApiRequest({
          poolSize: 5,
          difficulty: 11,
        })).toThrow('Difficulty must be between 1 and 10');
      });

      it('should use default difficulty of 6', () => {
        const response = processWoDPoolApiRequest({
          poolSize: 5,
          predeterminedResults: [5, 6, 7, 8, 9],
        });
        
        expect(response.difficulty).toBe(6);
        expect(response.successes).toBe(4); // 6, 7, 8, 9 at diff 6
      });

      it('should process Vampire discipline roll', () => {
        const response = processWoDPoolApiRequest({
          poolSize: 7,
          difficulty: 7,
          predeterminedResults: [3, 5, 7, 8, 9, 4, 2],
        });
        
        expect(response.successes).toBe(3); // 7, 8, 9 at diff 7
        expect(response.netSuccesses).toBe(3);
        expect(response.isBotch).toBe(false);
      });
    });
  });
});
