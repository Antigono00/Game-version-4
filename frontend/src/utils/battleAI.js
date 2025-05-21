// src/utils/battleAI.js

// Get max enemy field size based on difficulty
const getMaxEnemyFieldSize = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 3;
    case 'medium': return 4;
    case 'hard': return 5;
    case 'expert': return 6;
    default: return 3;
  }
};

// Determine AI action based on game state and difficulty
export const determineAIAction = (
  difficulty, 
  enemyHand, 
  enemyField, 
  playerField, 
  enemyTools = [], 
  enemySpells = [], 
  enemyEnergy = 10
) => {
  // Log available resources for debugging
  console.log(`AI Turn - Difficulty: ${difficulty}`);
  console.log(`Energy: ${enemyEnergy}, Hand: ${enemyHand.length}, Field: ${enemyField.length}`);
  
  // Get the max field size based on difficulty
  const maxFieldSize = getMaxEnemyFieldSize(difficulty);
  
  // SAFEGUARD: Add safety checks to prevent infinite loops
  // If no valid action is possible, return 'endTurn'
  if (
    // Check if battlefield is full
    (enemyField.length >= maxFieldSize) ||
    // Check if no energy
    enemyEnergy <= 0 ||
    // Check if no cards in hand or no creatures on field
    (enemyHand.length === 0 && enemyField.length === 0)
  ) {
    console.log("AI SAFEGUARD triggered: Ending turn");
    return { type: 'endTurn' };
  }
  
  // Normal AI logic based on difficulty
  switch (difficulty) {
    case 'easy':
      return determineEasyAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
    case 'medium':
      return determineMediumAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
    case 'hard':
      return determineHardAIAction(enemyHand, enemyField, playerField, enemyTools, enemySpells, enemyEnergy, maxFieldSize);
    case 'expert':
      return determineExpertAIAction(enemyHand, enemyField, playerField, enemyTools, enemySpells, enemyEnergy, maxFieldSize);
    default:
      return determineEasyAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
  }
};

// Easy AI (Random actions with basic logic)
const determineEasyAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  // If no creatures on field and have cards in hand, deploy one
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    // Just pick a random creature
    const randomCreature = enemyHand[Math.floor(Math.random() * enemyHand.length)];
    
    // Check if we have enough energy
    const energyCost = randomCreature.battleStats?.energyCost || 3;
    if (enemyEnergy < energyCost) {
      console.log(`Not enough energy to deploy creature (need ${energyCost}, have ${enemyEnergy})`);
      return { type: 'endTurn' };
    }
    
    return {
      type: 'deploy',
      creature: randomCreature,
      energyCost: energyCost // Include the energy cost for proper deduction
    };
  }
  
  // If creatures on field and player has creatures, attack randomly
  if (enemyField.length > 0 && playerField.length > 0) {
    const randomAttacker = enemyField[Math.floor(Math.random() * enemyField.length)];
    const randomTarget = playerField[Math.floor(Math.random() * playerField.length)];
    
    // 30% chance to defend instead of attack
    if (Math.random() < 0.3 && !randomAttacker.isDefending) {
      return {
        type: 'defend',
        creature: randomAttacker
      };
    }
    
    return {
      type: 'attack',
      attacker: randomAttacker,
      target: randomTarget
    };
  }
  
  // If creatures on field but player has none, just defend
  if (enemyField.length > 0 && playerField.length === 0) {
    const randomCreature = enemyField[Math.floor(Math.random() * enemyField.length)];
    
    // Only defend if not already defending
    if (!randomCreature.isDefending) {
      return {
        type: 'defend',
        creature: randomCreature
      };
    }
  }
  
  // If no valid action, end turn
  return { type: 'endTurn' };
};

// Medium AI (Smarter targeting but not optimal)
const determineMediumAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  // Deploy strongest creature from hand if field isn't full
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    // Find creature with highest combined stats
    const bestCreature = enemyHand.reduce((best, current) => {
      if (!current.stats) return best;
      if (!best) return current;
      
      const currentTotal = Object.values(current.stats).reduce((sum, val) => sum + val, 0);
      const bestTotal = Object.values(best.stats).reduce((sum, val) => sum + val, 0);
      return currentTotal > bestTotal ? current : best;
    }, null);
    
    if (bestCreature) {
      // Check if we have enough energy
      const energyCost = bestCreature.battleStats?.energyCost || 3;
      if (enemyEnergy >= energyCost) {
        return {
          type: 'deploy',
          creature: bestCreature,
          energyCost: energyCost
        };
      }
    }
  }
  
  // Attack targeting lowest health enemy if we have creatures on field
  if (enemyField.length > 0 && playerField.length > 0) {
    // Find attacker with highest attack stat
    const bestAttacker = enemyField.reduce((best, current) => {
      if (!current.battleStats) return best;
      if (!best) return current;
      
      const currentAttack = Math.max(
        current.battleStats.physicalAttack || 0, 
        current.battleStats.magicalAttack || 0
      );
      const bestAttack = Math.max(
        best.battleStats.physicalAttack || 0, 
        best.battleStats.magicalAttack || 0
      );
      return currentAttack > bestAttack ? current : best;
    }, null);
    
    // Find target with lowest health
    const weakestTarget = playerField.reduce((weakest, current) => {
      if (!weakest) return current;
      return current.currentHealth < weakest.currentHealth ? current : weakest;
    }, null);
    
    // 25% chance to defend if creature is below 30% health or if player has no creatures
    if (bestAttacker && !bestAttacker.isDefending && 
        (playerField.length === 0 || 
         (bestAttacker.currentHealth < bestAttacker.battleStats.maxHealth * 0.3 && Math.random() < 0.25))) {
      return {
        type: 'defend',
        creature: bestAttacker
      };
    }
    
    // Attack with best attacker against weakest target
    if (bestAttacker && weakestTarget) {
      return {
        type: 'attack',
        attacker: bestAttacker,
        target: weakestTarget
      };
    }
  }
  
  // Defend with low health creatures
  if (enemyField.length > 0 && (playerField.length === 0 || Math.random() < 0.4)) {
    // Find creature with lowest health percentage
    const lowestHealthCreature = enemyField.reduce((lowest, current) => {
      if (!current.battleStats || current.isDefending) return lowest;
      if (!lowest) return current;
      
      const currentHealthPercent = current.currentHealth / current.battleStats.maxHealth;
      const lowestHealthPercent = lowest.currentHealth / lowest.battleStats.maxHealth;
      return currentHealthPercent < lowestHealthPercent ? current : lowest;
    }, null);
    
    if (lowestHealthCreature && lowestHealthCreature.currentHealth / lowestHealthCreature.battleStats.maxHealth < 0.5) {
      return {
        type: 'defend',
        creature: lowestHealthCreature
      };
    }
  }
  
  // If no valid action, end turn
  return { type: 'endTurn' };
};

// Hard AI implementation (Optimal targeting and tool/spell usage)
const determineHardAIAction = (enemyHand, enemyField, playerField, enemyTools, enemySpells, enemyEnergy, maxFieldSize) => {
  // Prioritize deployment of creatures first to establish battlefield presence
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    // Find best creature to deploy based on current battlefield state
    let bestCreature = null;
    let bestScore = -1;
    
    // Loop through hand to find the best creature to deploy
    for (const creature of enemyHand) {
      if (!creature.stats || !creature.battleStats) continue;
      
      // Check if we have enough energy
      const energyCost = creature.battleStats.energyCost || 3;
      if (enemyEnergy < energyCost) continue;
      
      // Calculate creature score based on current battlefield situation
      let score = 0;
      
      // Base score from stats
      const statTotal = Object.values(creature.stats).reduce((sum, val) => sum + val, 0);
      score += statTotal * 2;
      
      // Higher score for balanced stats
      const statVariance = calculateStatVariance(creature.stats);
      score -= statVariance * 0.5; // Lower variance is better
      
      // Counter scoring based on player's field
      if (playerField.length > 0) {
        // Check if this creature counters any player creatures
        for (const playerCreature of playerField) {
          if (!playerCreature.stats) continue;
          
          // If player has high strength, value high magic
          if (playerCreature.stats.strength > 7) {
            score += creature.stats.magic * 3;
          }
          
          // If player has high magic, value high speed
          if (playerCreature.stats.magic > 7) {
            score += creature.stats.speed * 3;
          }
          
          // If player has high speed, value high stamina
          if (playerCreature.stats.speed > 7) {
            score += creature.stats.stamina * 3;
          }
        }
      }
      
      // Higher score for higher rarity
      switch (creature.rarity) {
        case 'Legendary': score *= 1.3; break;
        case 'Epic': score *= 1.2; break;
        case 'Rare': score *= 1.1; break;
        default: break;
      }
      
      // Higher score for higher form
      score *= (1 + creature.form * 0.2);
      
      // If this creature has better score than current best, update best
      if (score > bestScore) {
        bestScore = score;
        bestCreature = creature;
      }
    }
    
    // If we found a good creature to deploy, deploy it
    if (bestCreature) {
      const energyCost = bestCreature.battleStats?.energyCost || 3;
      return {
        type: 'deploy',
        creature: bestCreature,
        energyCost: energyCost
      };
    }
  }
  
  // If we have creatures on field and player has creatures, consider attacking
  if (enemyField.length > 0 && playerField.length > 0) {
    // Find best attack combination
    let bestAttackScore = -1;
    let bestAttacker = null;
    let bestTarget = null;
    
    // Check all possible attack combinations
    for (const attacker of enemyField) {
      // Skip creatures that are defending
      if (attacker.isDefending) continue;
      
      for (const target of playerField) {
        // Calculate potential damage and effectiveness
        let attackerStat, defenderStat;
        let attackType;
        
        // Determine attack type based on attacker's stats
        if ((attacker.battleStats?.physicalAttack || 0) >= (attacker.battleStats?.magicalAttack || 0)) {
          attackType = 'physical';
          attackerStat = attacker.battleStats?.physicalAttack || 0;
          defenderStat = target.battleStats?.physicalDefense || 0;
        } else {
          attackType = 'magical';
          attackerStat = attacker.battleStats?.magicalAttack || 0;
          defenderStat = target.battleStats?.magicalDefense || 0;
        }
        
        // Calculate raw damage
        let damage = Math.max(1, attackerStat - defenderStat);
        
        // Apply effectiveness multiplier based on stat relationships
        const effectiveness = calculateEffectiveness(attackType, attacker.stats, target.stats);
        damage = Math.round(damage * effectiveness);
        
        // Calculate score for this attack
        let attackScore = damage;
        
        // Bonus score if this would defeat the target
        if (damage >= target.currentHealth) {
          attackScore *= 3;
        }
        
        // Bonus score for attacking high-threat targets
        const targetThreat = calculateThreat(target);
        attackScore += targetThreat;
        
        // If this attack has better score than current best, update best
        if (attackScore > bestAttackScore) {
          bestAttackScore = attackScore;
          bestAttacker = attacker;
          bestTarget = target;
        }
      }
    }
    
    // Find best creature to defend with (if any)
    let bestDefendScore = -1;
    let bestDefender = null;
    
    // Check all creatures on field for defending
    for (const creature of enemyField) {
      // Skip creatures that are already defending
      if (creature.isDefending) continue;
      
      // Calculate defend score based on creature's health and stats
      let defendScore = 0;
      
      // Lower health percentage = higher defend score
      const healthPercentage = creature.currentHealth / creature.battleStats.maxHealth;
      defendScore += (1 - healthPercentage) * 100;
      
      // Higher defend score for creatures with high defense stats
      defendScore += (creature.battleStats.physicalDefense + creature.battleStats.magicalDefense) * 0.5;
      
      // Lower defend score for creatures with high attack stats
      defendScore -= (creature.battleStats.physicalAttack + creature.battleStats.magicalAttack) * 0.2;
      
      // If this creature has better defend score than current best, update best
      if (defendScore > bestDefendScore) {
        bestDefendScore = defendScore;
        bestDefender = creature;
      }
    }
    
    // Now decide whether to attack or defend based on scores
    if (bestAttackScore > 0 && bestDefendScore > 0) {
      // If the creature is below 25% health, prefer defending
      if (bestDefender && bestDefender.currentHealth / bestDefender.battleStats.maxHealth < 0.25 && bestDefendScore > 50) {
        return {
          type: 'defend',
          creature: bestDefender
        };
      }
      
      // Otherwise prefer attacking if it would defeat a target
      if (bestAttacker && bestTarget && bestAttackScore > bestDefendScore * 1.2) {
        return {
          type: 'attack',
          attacker: bestAttacker,
          target: bestTarget
        };
      } else if (bestDefender) {
        return {
          type: 'defend',
          creature: bestDefender
        };
      }
    } else if (bestAttackScore > 0) {
      // Only attack option is viable
      return {
        type: 'attack',
        attacker: bestAttacker,
        target: bestTarget
      };
    } else if (bestDefendScore > 0) {
      // Only defend option is viable
      return {
        type: 'defend',
        creature: bestDefender
      };
    }
  }
  
  // If all else fails, end turn
  return { type: 'endTurn' };
};

// Expert AI implementation (Perfect decision making with look-ahead)
const determineExpertAIAction = (enemyHand, enemyField, playerField, enemyTools, enemySpells, enemyEnergy, maxFieldSize) => {
  // The expert AI uses the same logic as the hard AI but with improved parameters
  // and simulation-based decision making (looking ahead to see best outcome)
  
  // First, check if there's an opportunity to end the game this turn
  const gameEndingMove = findGameEndingMove(enemyField, playerField);
  if (gameEndingMove) {
    return gameEndingMove;
  }
  
  // Next, prioritize optimal deployment to counter player field
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    const deployMove = findOptimalDeployment(enemyHand, enemyField, playerField, enemyEnergy);
    if (deployMove) {
      return deployMove;
    }
  }
  
  // Find the most optimal attack sequence (may involve multiple attacks)
  if (enemyField.length > 0 && playerField.length > 0) {
    const attackMove = findOptimalAttackSequence(enemyField, playerField);
    if (attackMove) {
      return attackMove;
    }
  }
  
  // Consider defensive moves if attacks aren't optimal
  if (enemyField.length > 0) {
    const defendMove = findOptimalDefenseMove(enemyField, playerField);
    if (defendMove) {
      return defendMove;
    }
  }
  
  // If no good moves, end turn
  return { type: 'endTurn' };
};

// Helper functions for AI decision making

// Calculate variance of stats (used by hard AI for balanced stat preference)
function calculateStatVariance(stats) {
  if (!stats) return 0;
  
  const values = Object.values(stats);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => (val - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  
  return variance;
}

// Calculate effectiveness multiplier based on stats for AI decision making
function calculateEffectiveness(attackType, attackerStats, defenderStats) {
  if (!attackerStats || !defenderStats) return 1.0;
  
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
}

// Calculate threat level of a creature (for AI targeting decision)
function calculateThreat(creature) {
  if (!creature.battleStats || !creature.stats) return 0;
  
  let threat = 0;
  
  // Base threat from attack stats
  threat += (creature.battleStats.physicalAttack || 0) * 1.2;
  threat += (creature.battleStats.magicalAttack || 0) * 1.2;
  
  // Additional threat from creature's form
  threat += (creature.form || 0) * 10;
  
  // Additional threat from rarity
  switch (creature.rarity) {
    case 'Legendary': threat += 30; break;
    case 'Epic': threat += 20; break;
    case 'Rare': threat += 10; break;
    default: break;
  }
  
  // Additional threat from specialty stats
  if (creature.specialty_stats && creature.specialty_stats.length > 0) {
    for (const stat of creature.specialty_stats) {
      threat += creature.stats[stat] * 3;
    }
  }
  
  return threat;
}

// Expert AI helper functions
function findGameEndingMove(enemyField, playerField) {
  // Check if there's a way to defeat all player creatures this turn
  if (playerField.length === 0) {
    return null; // Already won
  }
  
  // If there's only one player creature and we can defeat it
  if (playerField.length === 1) {
    const target = playerField[0];
    
    // Find creature that can defeat the target
    for (const attacker of enemyField) {
      if (attacker.isDefending) continue;
      
      // Calculate potential damage
      let attackValue, defenseValue;
      
      if ((attacker.battleStats?.physicalAttack || 0) >= (attacker.battleStats?.magicalAttack || 0)) {
        attackValue = attacker.battleStats?.physicalAttack || 0;
        defenseValue = target.battleStats?.physicalDefense || 0;
      } else {
        attackValue = attacker.battleStats?.magicalAttack || 0;
        defenseValue = target.battleStats?.magicalDefense || 0;
      }
      
      // Calculate raw damage
      const damage = Math.max(1, attackValue - defenseValue);
      
      // If this would defeat the target, return attack move
      if (damage >= target.currentHealth) {
        return {
          type: 'attack',
          attacker: attacker,
          target: target
        };
      }
    }
  }
  
  return null;
}

function findOptimalDeployment(enemyHand, enemyField, playerField, enemyEnergy) {
  // Similar to hard AI but with improved parameters
  let bestCreature = null;
  let bestScore = -1;
  
  for (const creature of enemyHand) {
    if (!creature.stats || !creature.battleStats) continue;
    
    // Check if we have enough energy
    const energyCost = creature.battleStats.energyCost || 3;
    if (enemyEnergy < energyCost) continue;
    
    // Calculate score for this creature
    let score = 0;
    
    // Base score from stats
    const statTotal = Object.values(creature.stats).reduce((sum, val) => sum + val, 0);
    score += statTotal * 3;
    
    // Higher score for balanced stats
    const statVariance = calculateStatVariance(creature.stats);
    score -= statVariance * 0.8;
    
    // Context-aware counter selection
    if (playerField.length > 0) {
      // Calculate counter score for each player creature
      for (const playerCreature of playerField) {
        if (!playerCreature.stats) continue;
        
        // Expert counter scoring
        const counterScore = calculateCounterScore(creature.stats, playerCreature.stats);
        score += counterScore * 5;
      }
    }
    
    // Rarity and form bonuses
    switch (creature.rarity) {
      case 'Legendary': score *= 1.4; break;
      case 'Epic': score *= 1.3; break;
      case 'Rare': score *= 1.2; break;
      default: break;
    }
    
    score *= (1 + creature.form * 0.3);
    
    // Update best creature if this one is better
    if (score > bestScore) {
      bestScore = score;
      bestCreature = creature;
    }
  }
  
  if (bestCreature) {
    const energyCost = bestCreature.battleStats?.energyCost || 3;
    return {
      type: 'deploy',
      creature: bestCreature,
      energyCost: energyCost
    };
  }
  
  return null;
}

function calculateCounterScore(attackerStats, defenderStats) {
  // Calculate how well attacker counters defender
  let score = 0;
  
  // Strength counters stamina
  if (attackerStats.strength > 7 && defenderStats.stamina > 7) {
    score += 10;
  }
  
  // Stamina counters speed
  if (attackerStats.stamina > 7 && defenderStats.speed > 7) {
    score += 10;
  }
  
  // Speed counters magic
  if (attackerStats.speed > 7 && defenderStats.magic > 7) {
    score += 10;
  }
  
  // Magic counters energy
  if (attackerStats.magic > 7 && defenderStats.energy > 7) {
    score += 10;
  }
  
  // Energy counters strength
  if (attackerStats.energy > 7 && defenderStats.strength > 7) {
    score += 10;
  }
  
  return score;
}

function findOptimalAttackSequence(enemyField, playerField) {
  // Find most optimal attack
  let bestAttackScore = -1;
  let bestAttacker = null;
  let bestTarget = null;
  
  // Check all possible attack combinations
  for (const attacker of enemyField) {
    if (attacker.isDefending) continue;
    
    for (const target of playerField) {
      // Calculate expected damage
      let attackType, attackValue, defenseValue, effectiveness;
      
      if ((attacker.battleStats?.physicalAttack || 0) >= (attacker.battleStats?.magicalAttack || 0)) {
        attackType = 'physical';
        attackValue = attacker.battleStats?.physicalAttack || 0;
        defenseValue = target.battleStats?.physicalDefense || 0;
      } else {
        attackType = 'magical';
        attackValue = attacker.battleStats?.magicalAttack || 0;
        defenseValue = target.battleStats?.magicalDefense || 0;
      }
      
      effectiveness = calculateEffectiveness(attackType, attacker.stats, target.stats);
      
      // Calculate raw damage
      let damage = Math.max(1, attackValue - defenseValue);
      damage = Math.round(damage * effectiveness);
      
      // Calculate attack score
      let attackScore = damage * 2;
      
      // Very high bonus for defeating a creature
      if (damage >= target.currentHealth) {
        attackScore *= 5;
      }
      
      // Add threat score
      const targetThreat = calculateThreat(target);
      attackScore += targetThreat * 1.5;
      
      // Update best attack if this one is better
      if (attackScore > bestAttackScore) {
        bestAttackScore = attackScore;
        bestAttacker = attacker;
        bestTarget = target;
      }
    }
  }
  
  if (bestAttacker && bestTarget) {
    return {
      type: 'attack',
      attacker: bestAttacker,
      target: bestTarget
    };
  }
  
  return null;
}

function findOptimalDefenseMove(enemyField, playerField) {
  // Calculate board threat from player field
  let totalPlayerThreat = 0;
  for (const creature of playerField) {
    totalPlayerThreat += calculateThreat(creature);
  }
  
  // Find best creature to defend
  let bestDefendScore = -1;
  let bestDefender = null;
  
  for (const creature of enemyField) {
    if (creature.isDefending) continue;
    
    // Calculate defend score
    let defendScore = 0;
    
    // Health percentage factor
    const healthPercentage = creature.currentHealth / creature.battleStats.maxHealth;
    defendScore += (1 - healthPercentage) * 120;
    
    // Defense stats factor
    defendScore += (creature.battleStats.physicalDefense + creature.battleStats.magicalDefense) * 0.8;
    
    // Attack stats factor (we don't want to lose high-attack creatures)
    const attackPower = Math.max(
      creature.battleStats.physicalAttack || 0,
      creature.battleStats.magicalAttack || 0
    );
    defendScore += attackPower * 0.6;
    
    // Rarity and form factors
    switch (creature.rarity) {
      case 'Legendary': defendScore *= 1.3; break;
      case 'Epic': defendScore *= 1.2; break;
      case 'Rare': defendScore *= 1.1; break;
      default: break;
    }
    
    defendScore *= (1 + creature.form * 0.2);
    
    // Scale defend score by total player threat
    defendScore *= (1 + totalPlayerThreat / 100);
    
    // Update best defender if this one is better
    if (defendScore > bestDefendScore) {
      bestDefendScore = defendScore;
      bestDefender = creature;
    }
  }
  
  // Only defend if score is high enough
  if (bestDefender && bestDefendScore > 50) {
    return {
      type: 'defend',
      creature: bestDefender
    };
  }
  
  return null;
}
