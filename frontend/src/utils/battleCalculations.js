// src/utils/battleCalculations.js - Fixed to handle missing properties
// Calculate derived stats from base creature stats
export const calculateDerivedStats = (creature) => {
  // Validate input
  if (!creature || !creature.stats) {
    // Return default stats if creature or stats are missing
    return {
      physicalAttack: 10,
      magicalAttack: 10,
      physicalDefense: 5,
      magicalDefense: 5,
      maxHealth: 50,
      initiative: 10,
      criticalChance: 5,
      dodgeChance: 3,
      energyCost: 3
    };
  }
  
  const { energy, strength, magic, stamina, speed } = creature.stats;
  const rarity = getRarityMultiplier(creature.rarity);
  const form = getFormMultiplier(creature.form || 0);
  const combinationBonus = (creature.combination_level || 0) * 0.1 + 1; // +10% per combination level
  
  return {
    physicalAttack: Math.round((10 + (strength * 2) + (speed * 0.5)) * form * combinationBonus),
    magicalAttack: Math.round((10 + (magic * 2) + (energy * 0.5)) * form * combinationBonus),
    physicalDefense: Math.round((5 + (stamina * 1.5) + (strength * 0.5)) * form * combinationBonus),
    magicalDefense: Math.round((5 + (energy * 1.5) + (magic * 0.5)) * form * combinationBonus),
    maxHealth: Math.round((50 + (stamina * 3) + (energy * 1)) * rarity * form),
    initiative: Math.round(10 + (speed * 2)),
    criticalChance: Math.min(5 + (speed * 0.5), 30), // Max 30%
    dodgeChance: Math.min(3 + (speed * 0.3), 20), // Max 20%
    energyCost: Math.max(1, Math.round(10 - (energy * 0.2))), // Lower cost with higher energy
  };
};

// Calculate damage for an attack
export const calculateDamage = (attacker, defender, attackType = 'physical') => {
  // Validate input
  if (!attacker || !defender || !attacker.battleStats || !defender.battleStats) {
    return {
      damage: 1, // Default minimal damage
      isDodged: false,
      isCritical: false,
      effectiveness: 'normal'
    };
  }
  
  // Get derived stats from battleStats
  const attackerStats = attacker.battleStats;
  const defenderStats = defender.battleStats;
  
  // Determine base attack and defense values based on attack type
  const attackValue = attackType === 'physical' 
    ? attackerStats.physicalAttack 
    : attackerStats.magicalAttack;
    
  const defenseValue = attackType === 'physical' 
    ? defenderStats.physicalDefense 
    : defenderStats.magicalDefense;
  
  // Calculate effectiveness multiplier based on stat relationships
  const effectivenessMultiplier = getEffectivenessMultiplier(
    attackType, 
    attacker.stats || {}, 
    defender.stats || {}
  );
  
  // Calculate random variance (±10%)
  const variance = 0.9 + (Math.random() * 0.2);
  
  // Check for critical hit
  const criticalRoll = Math.random() * 100;
  const isCritical = criticalRoll <= (attackerStats.criticalChance || 5);
  const criticalMultiplier = isCritical ? 1.5 : 1;
  
  // Check for dodge
  const dodgeRoll = Math.random() * 100;
  const isDodged = dodgeRoll <= (defenderStats.dodgeChance || 3);
  
  if (isDodged) {
    return {
      damage: 0,
      isDodged: true,
      isCritical: false,
      effectiveness: 'normal'
    };
  }
  
  // Calculate final damage
  let rawDamage = (attackValue * effectivenessMultiplier * variance * criticalMultiplier);
  let finalDamage = Math.max(1, Math.round(rawDamage - defenseValue));
  
  return {
    damage: finalDamage,
    isDodged: false,
    isCritical,
    effectiveness: getEffectivenessText(effectivenessMultiplier)
  };
};

// Calculate effectiveness multiplier based on stat relationships
export const getEffectivenessMultiplier = (attackType, attackerStats, defenderStats) => {
  // Check for missing stats
  if (!attackerStats || !defenderStats) {
    return 1.0; // Default normal effectiveness
  }
  
  // Rock-Paper-Scissors relationships:
  // Strength > Stamina > Speed > Magic > Energy > Strength
  
  if (attackType === 'physical') {
    // Physical attacks are based on Strength
    if (defenderStats.stamina > defenderStats.energy) {
      // Strong against stamina-focused defenders
      return 1.5;
    } else if (defenderStats.magic > defenderStats.stamina) {
      // Weak against magic-focused defenders
      return 0.75;
    }
  } else {
    // Magical attacks are based on Magic
    if (defenderStats.speed > defenderStats.strength) {
      // Strong against speed-focused defenders
      return 1.5;
    } else if (defenderStats.energy > defenderStats.magic) {
      // Weak against energy-focused defenders
      return 0.75;
    }
  }
  
  // Default: normal effectiveness
  return 1.0;
};

// Get text description of effectiveness
export const getEffectivenessText = (multiplier) => {
  if (multiplier >= 1.5) return 'super effective';
  if (multiplier <= 0.75) return 'not very effective';
  return 'normal';
};

// Get multipliers based on rarity and form
export const getRarityMultiplier = (rarity) => {
  if (!rarity) return 1.0; // Default if missing
  
  switch (rarity) {
    case 'Legendary': return 1.3;
    case 'Epic': return 1.2;
    case 'Rare': return 1.1;
    default: return 1.0;
  }
};

export const getFormMultiplier = (form) => {
  if (form === undefined || form === null) return 1.0; // Default if missing
  return 1 + (form * 0.25); // Form 0 = 1.0x, Form 3 = 1.75x
};
