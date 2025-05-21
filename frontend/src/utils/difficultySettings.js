// src/utils/difficultySettings.js - Fixed import paths and updated enemy counts
import { 
  getRandomCreatureTemplate, 
  createEnemyCreature 
} from './enemyCreatures';

// Define settings for each difficulty level
export const getDifficultySettings = (difficulty) => {
  const settings = {
    easy: {
      enemyStatsMultiplier: 0.8, // Enemy creatures are 80% as strong
      enemyCreatureLevel: {
        min: 0, // Form 0 creatures
        max: 1  // Up to Form 1 creatures
      },
      enemyRarity: {
        common: 0.7,
        rare: 0.3,
        epic: 0,
        legendary: 0
      },
      initialHandSize: 2,
      enemyDeckSize: 3, // Total number of creatures the AI will have
      maxFieldSize: 3,  // Maximum number of creatures on the field
      enemyAILevel: 1,  // Basic decision making
      enemyEnergyRegen: 2, // 2 energy per turn
      rewardMultiplier: 0.5
    },
    
    medium: {
      enemyStatsMultiplier: 1.0, // Equal strength
      enemyCreatureLevel: {
        min: 1, // Form 1 creatures
        max: 2  // Up to Form 2 creatures
      },
      enemyRarity: {
        common: 0.5,
        rare: 0.3,
        epic: 0.2,
        legendary: 0
      },
      initialHandSize: 3,
      enemyDeckSize: 4, // Total number of creatures the AI will have
      maxFieldSize: 4,  // Maximum number of creatures on the field 
      enemyAILevel: 2,  // Better decisions
      enemyEnergyRegen: 3,
      rewardMultiplier: 1.0
    },
    
    hard: {
      enemyStatsMultiplier: 1.2, // 20% stronger
      enemyCreatureLevel: {
        min: 1,
        max: 3  // Up to Form 3 creatures
      },
      enemyRarity: {
        common: 0.2,
        rare: 0.4,
        epic: 0.3,
        legendary: 0.1
      },
      initialHandSize: 3,
      enemyDeckSize: 5, // Total number of creatures the AI will have 
      maxFieldSize: 5,  // Maximum number of creatures on the field
      enemyAILevel: 3,  // Advanced decision making
      enemyEnergyRegen: 4,
      rewardMultiplier: 1.5
    },
    
    expert: {
      enemyStatsMultiplier: 1.5, // 50% stronger
      enemyCreatureLevel: {
        min: 2,
        max: 3
      },
      enemyRarity: {
        common: 0,
        rare: 0.3,
        epic: 0.5,
        legendary: 0.2
      },
      initialHandSize: 4,
      enemyDeckSize: 6, // Total number of creatures the AI will have
      maxFieldSize: 6,  // Maximum number of creatures on the field
      enemyAILevel: 4,  // Expert decision making
      enemyEnergyRegen: 5,
      rewardMultiplier: 2.0
    }
  };
  
  return settings[difficulty] || settings.medium;
};

// Generate enemy creatures based on difficulty
// Added playerCreatures parameter to generate enemies based on available creatures
export const generateEnemyCreatures = (difficulty, count = 5, playerCreatures = []) => {
  const settings = getDifficultySettings(difficulty);
  
  // Limit the count to match the maximum deck size for this difficulty
  const maxCreatureCount = settings.enemyDeckSize || 5;
  const adjustedCount = Math.min(count, maxCreatureCount);
  
  const creatures = [];

  // Create a pool of species templates from player creatures or use defaults
  const speciesPool = [];
  
  if (playerCreatures && playerCreatures.length > 0) {
    // Extract unique species from player creatures
    const playerSpeciesIds = new Set();
    
    playerCreatures.forEach(creature => {
      if (creature.species_id) {
        playerSpeciesIds.add(creature.species_id);
      }
    });
    
    // If we found player species, convert to array, otherwise use empty array
    // to allow the default random selection below
    Array.from(playerSpeciesIds).forEach(speciesId => {
      speciesPool.push(speciesId);
    });
  }
  
  for (let i = 0; i < adjustedCount; i++) {
    // Generate a creature with appropriate rarity
    const rarity = selectRarity(settings.enemyRarity);
    
    // Generate form level within allowed range
    const form = Math.floor(
      Math.random() * (settings.enemyCreatureLevel.max - settings.enemyCreatureLevel.min + 1)
    ) + settings.enemyCreatureLevel.min;
    
    // Select a species ID - either from player creatures or random
    let speciesId;
    if (speciesPool.length > 0) {
      speciesId = speciesPool[Math.floor(Math.random() * speciesPool.length)];
    } else {
      // Get a random template if we don't have player species
      const template = getRandomCreatureTemplate();
      speciesId = template.id;
    }
    
    // Generate base stats based on rarity and form
    const stats = generateStats(rarity, form, settings.enemyStatsMultiplier);
    
    // Create the enemy creature
    const creature = createEnemyCreature(speciesId, form, rarity, stats);
    creatures.push(creature);
  }
  
  return creatures;
};

// Select rarity based on probability distribution
function selectRarity(rarityDistribution) {
  const rnd = Math.random();
  let cumulativeProbability = 0;
  
  for (const [rarity, probability] of Object.entries(rarityDistribution)) {
    cumulativeProbability += probability;
    if (rnd <= cumulativeProbability) {
      return rarity.charAt(0).toUpperCase() + rarity.slice(1); // Capitalize
    }
  }
  
  return 'Common'; // Fallback
}

// Generate stats based on rarity, form and difficulty multiplier
function generateStats(rarity, form, statsMultiplier) {
  // Base stats based on rarity
  let baseStats;
  switch (rarity) {
    case 'Legendary':
      baseStats = { energy: 8, strength: 8, magic: 8, stamina: 8, speed: 8 };
      break;
    case 'Epic':
      baseStats = { energy: 7, strength: 7, magic: 7, stamina: 7, speed: 7 };
      break;
    case 'Rare':
      baseStats = { energy: 6, strength: 6, magic: 6, stamina: 6, speed: 6 };
      break;
    default:
      baseStats = { energy: 5, strength: 5, magic: 5, stamina: 5, speed: 5 };
  }
  
  // Apply form bonus
  const formBonus = form * 1;
  
  // Randomize stats within range and apply multiplier
  const stats = {};
  for (const [stat, value] of Object.entries(baseStats)) {
    // Add random variation (-1 to +1)
    const randomizedValue = value + formBonus + (Math.floor(Math.random() * 3) - 1);
    // Apply difficulty multiplier
    stats[stat] = Math.round(randomizedValue * statsMultiplier);
  }
  
  return stats;
}
