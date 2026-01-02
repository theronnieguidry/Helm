import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rollDie,
  rollDice,
  rollPolyhedral,
  calculateWoDResults,
  rollWoDPool,
  isValidWoDDifficulty,
  isValidPolyhedralDie,
  DIE_MAX,
  type PolyhedralDie,
} from './dice';

describe('Dice Utilities', () => {
  describe('rollDie', () => {
    it('should return a number between 1 and sides inclusive', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(6);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(6);
      }
    });

    it('should work for different die sizes', () => {
      const dieSizes = [4, 6, 8, 10, 12, 20, 100];
      for (const sides of dieSizes) {
        for (let i = 0; i < 50; i++) {
          const result = rollDie(sides);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(sides);
        }
      }
    });
  });

  describe('rollDice', () => {
    it('should return the correct number of dice', () => {
      const results = rollDice(6, 5);
      expect(results).toHaveLength(5);
    });

    it('should return all values within valid range', () => {
      const results = rollDice(20, 10);
      results.forEach(result => {
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
      });
    });
  });

  describe('isValidPolyhedralDie', () => {
    it('should return true for valid die types', () => {
      const validDice: PolyhedralDie[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
      validDice.forEach(die => {
        expect(isValidPolyhedralDie(die)).toBe(true);
      });
    });

    it('should return false for invalid die types', () => {
      expect(isValidPolyhedralDie('d5')).toBe(false);
      expect(isValidPolyhedralDie('d7')).toBe(false);
      expect(isValidPolyhedralDie('invalid')).toBe(false);
      expect(isValidPolyhedralDie('')).toBe(false);
    });
  });

  describe('isValidWoDDifficulty', () => {
    it('should return true for valid difficulties (1-10)', () => {
      for (let i = 1; i <= 10; i++) {
        expect(isValidWoDDifficulty(i)).toBe(true);
      }
    });

    it('should return false for invalid difficulties', () => {
      expect(isValidWoDDifficulty(0)).toBe(false);
      expect(isValidWoDDifficulty(11)).toBe(false);
      expect(isValidWoDDifficulty(-1)).toBe(false);
      expect(isValidWoDDifficulty(5.5)).toBe(false);
    });
  });
});

describe('Polyhedral Dice (D&D/Pathfinder)', () => {
  describe('rollPolyhedral with predetermined results', () => {
    it('should correctly sum dice and add modifier', () => {
      const result = rollPolyhedral('d20', 2, 5, [15, 10]);
      expect(result.results).toEqual([15, 10]);
      expect(result.total).toBe(30); // 15 + 10 + 5 = 30
      expect(result.modifier).toBe(5);
    });

    it('should handle negative modifiers', () => {
      const result = rollPolyhedral('d6', 3, -2, [4, 5, 6]);
      expect(result.total).toBe(13); // 4 + 5 + 6 - 2 = 13
    });

    it('should detect critical success (max roll)', () => {
      const result = rollPolyhedral('d20', 1, 0, [20]);
      expect(result.hasCriticalSuccess).toBe(true);
      expect(result.hasCriticalFailure).toBe(false);
    });

    it('should detect critical failure (roll of 1)', () => {
      const result = rollPolyhedral('d20', 1, 0, [1]);
      expect(result.hasCriticalSuccess).toBe(false);
      expect(result.hasCriticalFailure).toBe(true);
    });

    it('should detect both critical success and failure in same roll', () => {
      const result = rollPolyhedral('d20', 3, 0, [1, 15, 20]);
      expect(result.hasCriticalSuccess).toBe(true);
      expect(result.hasCriticalFailure).toBe(true);
    });

    it('should handle single die correctly', () => {
      const result = rollPolyhedral('d4', 1, 0, [3]);
      expect(result.results).toEqual([3]);
      expect(result.total).toBe(3);
      expect(result.count).toBe(1);
      expect(result.diceType).toBe('d4');
    });

    it('should handle d100 correctly', () => {
      const result = rollPolyhedral('d100', 1, 0, [57]);
      expect(result.total).toBe(57);
      expect(result.hasCriticalSuccess).toBe(false);
      
      const critResult = rollPolyhedral('d100', 1, 0, [100]);
      expect(critResult.hasCriticalSuccess).toBe(true);
    });
  });

  describe('D&D 5e specific scenarios', () => {
    it('should calculate attack roll correctly', () => {
      // Attack roll: 1d20 + attack modifier
      const result = rollPolyhedral('d20', 1, 7, [14]);
      expect(result.total).toBe(21); // 14 + 7 = 21
    });

    it('should calculate damage roll correctly', () => {
      // Greatsword damage: 2d6 + strength modifier
      const result = rollPolyhedral('d6', 2, 4, [5, 3]);
      expect(result.total).toBe(12); // 5 + 3 + 4 = 12
    });

    it('should handle fireball damage (8d6)', () => {
      const result = rollPolyhedral('d6', 8, 0, [1, 2, 3, 4, 5, 6, 6, 5]);
      expect(result.total).toBe(32);
      expect(result.hasCriticalFailure).toBe(true); // Has at least one 1
      expect(result.hasCriticalSuccess).toBe(true); // Has at least one 6
    });

    it('should handle sneak attack (6d6)', () => {
      const result = rollPolyhedral('d6', 6, 0, [4, 3, 5, 2, 6, 1]);
      expect(result.total).toBe(21);
    });
  });

  describe('Pathfinder 2e specific scenarios', () => {
    it('should calculate skill check correctly', () => {
      // Skill check: 1d20 + skill modifier
      const result = rollPolyhedral('d20', 1, 12, [18]);
      expect(result.total).toBe(30);
    });

    it('should recognize natural 20 (critical success)', () => {
      const result = rollPolyhedral('d20', 1, 5, [20]);
      expect(result.hasCriticalSuccess).toBe(true);
      expect(result.total).toBe(25);
    });

    it('should recognize natural 1 (critical failure)', () => {
      const result = rollPolyhedral('d20', 1, 5, [1]);
      expect(result.hasCriticalFailure).toBe(true);
      expect(result.total).toBe(6);
    });
  });
});

describe('World of Darkness d10 Pool (Vampire/Werewolf)', () => {
  describe('calculateWoDResults', () => {
    describe('basic success counting', () => {
      it('should count successes at difficulty threshold', () => {
        // Difficulty 6: dice showing 6+ are successes
        const result = calculateWoDResults([6, 7, 8, 9, 10], 6);
        expect(result.successes).toBe(5);
        expect(result.ones).toBe(0);
        expect(result.netSuccesses).toBe(5);
        expect(result.isBotch).toBe(false);
      });

      it('should count successes at higher difficulty', () => {
        // Difficulty 8: only 8, 9, 10 are successes
        const result = calculateWoDResults([6, 7, 8, 9, 10], 8);
        expect(result.successes).toBe(3); // 8, 9, 10
        expect(result.netSuccesses).toBe(3);
      });

      it('should count successes at lower difficulty', () => {
        // Difficulty 4: 4+ are successes
        const result = calculateWoDResults([3, 4, 5, 6], 4);
        expect(result.successes).toBe(3); // 4, 5, 6
      });

      it('should handle no successes', () => {
        const result = calculateWoDResults([2, 3, 4, 5], 6);
        expect(result.successes).toBe(0);
        expect(result.netSuccesses).toBe(0);
        expect(result.isBotch).toBe(false); // No 1s, so not a botch
      });
    });

    describe('ones canceling successes', () => {
      it('should have ones cancel successes', () => {
        // 2 successes (6, 7) - 1 one = 1 net success
        const result = calculateWoDResults([1, 6, 7], 6);
        expect(result.successes).toBe(2);
        expect(result.ones).toBe(1);
        expect(result.netSuccesses).toBe(1);
        expect(result.isBotch).toBe(false);
      });

      it('should handle multiple ones canceling multiple successes', () => {
        // 3 successes - 2 ones = 1 net success
        const result = calculateWoDResults([1, 1, 6, 7, 8], 6);
        expect(result.successes).toBe(3);
        expect(result.ones).toBe(2);
        expect(result.netSuccesses).toBe(1);
        expect(result.isBotch).toBe(false);
      });

      it('should handle ones exactly canceling all successes', () => {
        // 2 successes - 2 ones = 0 net successes (BOTCH!)
        const result = calculateWoDResults([1, 1, 6, 7], 6);
        expect(result.successes).toBe(2);
        expect(result.ones).toBe(2);
        expect(result.netSuccesses).toBe(0);
        expect(result.isBotch).toBe(true);
      });

      it('should handle more ones than successes', () => {
        // 1 success - 3 ones = 0 net successes (BOTCH!)
        const result = calculateWoDResults([1, 1, 1, 6], 6);
        expect(result.successes).toBe(1);
        expect(result.ones).toBe(3);
        expect(result.netSuccesses).toBe(0); // Cannot go negative
        expect(result.isBotch).toBe(true);
      });
    });

    describe('botch detection', () => {
      it('should detect botch when no successes and ones present', () => {
        const result = calculateWoDResults([1, 2, 3, 4], 6);
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(1);
        expect(result.isBotch).toBe(true);
      });

      it('should detect botch when success canceled by one', () => {
        // The classic example: roll 6 and 1 at difficulty 6
        const result = calculateWoDResults([6, 1], 6);
        expect(result.successes).toBe(1);
        expect(result.ones).toBe(1);
        expect(result.netSuccesses).toBe(0);
        expect(result.isBotch).toBe(true);
      });

      it('should NOT botch when no ones are present', () => {
        const result = calculateWoDResults([2, 3, 4, 5], 6);
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(0);
        expect(result.isBotch).toBe(false); // Just a failure, not a botch
      });

      it('should NOT botch when net successes are positive', () => {
        const result = calculateWoDResults([1, 6, 7, 8], 6);
        expect(result.successes).toBe(3);
        expect(result.ones).toBe(1);
        expect(result.netSuccesses).toBe(2);
        expect(result.isBotch).toBe(false);
      });

      it('should handle multiple ones causing botch', () => {
        const result = calculateWoDResults([1, 1, 1, 2, 3], 6);
        expect(result.ones).toBe(3);
        expect(result.isBotch).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle single die roll - success', () => {
        const result = calculateWoDResults([10], 6);
        expect(result.successes).toBe(1);
        expect(result.netSuccesses).toBe(1);
        expect(result.isBotch).toBe(false);
      });

      it('should handle single die roll - failure', () => {
        const result = calculateWoDResults([3], 6);
        expect(result.successes).toBe(0);
        expect(result.netSuccesses).toBe(0);
        expect(result.isBotch).toBe(false);
      });

      it('should handle single die roll - botch', () => {
        const result = calculateWoDResults([1], 6);
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(1);
        expect(result.isBotch).toBe(true);
      });

      it('should handle 10s always being successes regardless of difficulty', () => {
        const result = calculateWoDResults([10], 10);
        expect(result.successes).toBe(1);
        expect(result.netSuccesses).toBe(1);
      });

      it('should handle difficulty 10 correctly', () => {
        // Only 10 is a success
        const result = calculateWoDResults([9, 10], 10);
        expect(result.successes).toBe(1);
      });

      it('should handle large dice pools', () => {
        const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 6, 7, 8, 9, 10];
        const result = calculateWoDResults(pool, 6);
        expect(result.successes).toBe(10); // All 6+
        expect(result.ones).toBe(1);
        expect(result.netSuccesses).toBe(9);
      });

      it('should handle empty pool', () => {
        const result = calculateWoDResults([], 6);
        expect(result.successes).toBe(0);
        expect(result.ones).toBe(0);
        expect(result.netSuccesses).toBe(0);
        expect(result.isBotch).toBe(false);
      });
    });
  });

  describe('Vampire: The Masquerade specific scenarios', () => {
    it('should handle a typical Discipline roll', () => {
      // Rolling Manipulation + Dominate to command someone
      // Pool of 7 dice, difficulty 6
      const result = rollWoDPool(7, 6, [3, 5, 6, 7, 8, 2, 1]);
      expect(result.successes).toBe(3); // 6, 7, 8
      expect(result.ones).toBe(1);
      expect(result.netSuccesses).toBe(2);
      expect(result.isBotch).toBe(false);
    });

    it('should handle a Frenzy check', () => {
      // Self-control roll, typically difficulty 6-8
      const result = rollWoDPool(4, 7, [2, 3, 7, 8]);
      expect(result.successes).toBe(2);
      expect(result.isBotch).toBe(false);
    });

    it('should detect botch on combat roll', () => {
      // Combat roll gone horribly wrong
      const result = rollWoDPool(5, 6, [1, 1, 2, 3, 4]);
      expect(result.isBotch).toBe(true);
    });
  });

  describe('Werewolf: The Apocalypse specific scenarios', () => {
    it('should handle a Rage roll', () => {
      // Rage rolls to activate Gifts or check for frenzy
      const result = rollWoDPool(6, 6, [4, 5, 6, 7, 8, 9]);
      expect(result.successes).toBe(4); // 6, 7, 8, 9
      expect(result.netSuccesses).toBe(4);
    });

    it('should handle a Gnosis roll', () => {
      // Using Gnosis for spirit-related tasks
      const result = rollWoDPool(5, 7, [3, 4, 7, 8, 10]);
      expect(result.successes).toBe(3);
    });

    it('should handle a combat botch', () => {
      // Combat can be dangerous when you botch
      const result = rollWoDPool(8, 6, [1, 1, 2, 3, 4, 5, 6, 1]);
      expect(result.successes).toBe(1); // Only the 6
      expect(result.ones).toBe(3);
      expect(result.netSuccesses).toBe(0);
      expect(result.isBotch).toBe(true);
    });
  });

  describe('rollWoDPool', () => {
    it('should return complete result structure', () => {
      const result = rollWoDPool(5, 6, [4, 5, 6, 7, 8]);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('successes');
      expect(result).toHaveProperty('ones');
      expect(result).toHaveProperty('netSuccesses');
      expect(result).toHaveProperty('isBotch');
      expect(result).toHaveProperty('difficulty');
      expect(result).toHaveProperty('poolSize');
    });

    it('should track pool size correctly', () => {
      const result = rollWoDPool(10, 6, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.poolSize).toBe(10);
      expect(result.results).toHaveLength(10);
    });

    it('should use default difficulty of 6', () => {
      const result = rollWoDPool(3, undefined, [5, 6, 7]);
      expect(result.difficulty).toBe(6);
      expect(result.successes).toBe(2); // 6, 7 at difficulty 6
    });
  });
});
