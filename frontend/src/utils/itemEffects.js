// src/utils/itemEffects.js

// Get tool effect details based on tool type and effect
export const getToolEffect = (tool) => {
  const effect = tool.tool_effect;
  const type = tool.tool_type;
  
  // Base effects depending on tool type (which stat it affects)
  const baseEffects = {
    energy: { 
      statChanges: { energyCost: -1 }, // Reduces energy cost 
      duration: 3
    },
    strength: { 
      statChanges: { physicalAttack: 5 }, 
      duration: 3
    },
    magic: { 
      statChanges: { magicalAttack: 5 }, 
      duration: 3
    },
    stamina: { 
      statChanges: { physicalDefense: 5 }, 
      healthChange: 10, // Heal 10 HP
      duration: 3
    },
    speed: { 
      statChanges: { initiative: 5, dodgeChance: 3 }, 
      duration: 3
    }
  };
  
  // Modify base effect based on effect type
  const baseEffect = baseEffects[type] || { duration: 3 };
  
  switch (effect) {
    case 'Surge':
      // Stronger but shorter effect
      return {
        ...baseEffect,
        statChanges: Object.entries(baseEffect.statChanges).reduce((acc, [stat, value]) => {
          acc[stat] = value * 2; // Double effect
          return acc;
        }, {}),
        duration: 1 // But only lasts 1 turn
      };
      
    case 'Shield':
      // Defensive effect
      return {
        statChanges: { 
          physicalDefense: 8, 
          magicalDefense: 8 
        },
        duration: 3
      };
      
    case 'Echo':
      // Repeating effect (weaker but lasts longer)
      return {
        ...baseEffect,
        statChanges: Object.entries(baseEffect.statChanges).reduce((acc, [stat, value]) => {
          acc[stat] = Math.round(value * 0.7); // 70% strength
          return acc;
        }, {}),
        duration: 5 // But lasts 5 turns
      };
      
    case 'Drain':
      // Converts defense to attack
      return {
        statChanges: {
          physicalAttack: 7,
          magicalAttack: 7,
          physicalDefense: -3,
          magicalDefense: -3
        },
        duration: 3
      };
      
    case 'Charge':
      // Builds up over time
      return {
        statChanges: {},  // No immediate effect
        chargeEffect: {
          targetStat: Object.keys(baseEffect.statChanges)[0],
          perTurnBonus: 3, // +3 per turn
          maxTurns: 3
        },
        duration: 3
      };
      
    // Default case - use the base effect
    default:
      return baseEffect;
  }
};

// Get spell effect details based on spell type, effect, and caster's magic
export const getSpellEffect = (spell, casterMagic = 5) => {
  const effect = spell.spell_effect;
  const type = spell.spell_type;
  
  // Magic power modifier
  const magicPower = 1 + (casterMagic * 0.1); // +10% per magic point
  
  // Base effects depending on spell type
  const baseEffects = {
    energy: { 
      statChanges: { energyCost: -2 },
      energyGain: 5,
      duration: 2
    },
    strength: { 
      damage: 15 * magicPower, // Direct damage scaled by magic
      statChanges: { physicalAttack: 7 },
      duration: 2
    },
    magic: { 
      statChanges: { magicalAttack: 7, magicalDefense: 3 },
      duration: 2
    },
    stamina: { 
      healing: 20 * magicPower, // Healing scaled by magic
      statChanges: { physicalDefense: 5 },
      duration: 2
    },
    speed: { 
      statChanges: { initiative: 7, dodgeChance: 5, criticalChance: 5 },
      duration: 2
    }
  };
  
  // Modify base effect based on effect type
  const baseEffect = baseEffects[type] || { duration: 2 };
  
  switch (effect) {
    case 'Surge':
      // High damage spell
      return {
        damage: (baseEffect.damage || 0) * 2,
        duration: 0 // No lingering effect
      };
      
    case 'Shield':
      // Protective spell
      return {
        statChanges: {
          physicalDefense: 10,
          magicalDefense: 10
        },
        healing: 10 * magicPower,
        duration: 2
      };
      
    case 'Echo':
      // Repeating damage/healing over time
      return {
        healthOverTime: baseEffect.healing 
          ? Math.round((baseEffect.healing / 3) * magicPower) // Healing over time
          : baseEffect.damage 
            ? Math.round(-(baseEffect.damage / 3) * magicPower) // Damage over time
            : 0,
        duration: 3
      };
      
    case 'Drain':
      // Life drain spell
      return {
        damage: 12 * magicPower,
        selfHeal: 6 * magicPower, // Heal caster for half the damage
        duration: 0
      };
      
    case 'Charge':
      // Charged attack spell (must be prepared)
      return {
        prepareEffect: {
          name: 'Charging',
          turns: 1,
          damage: 25 * magicPower // Big damage after charge
        },
        duration: 1
      };
      
    // Default case - use the base effect
    default:
      return baseEffect;
  }
};
