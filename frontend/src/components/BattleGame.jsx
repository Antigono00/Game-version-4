// src/components/BattleGame.jsx
import React, { useState, useEffect, useContext, useCallback, useReducer } from 'react';
import { GameContext } from '../context/GameContext';
import { useRadixConnect } from '../context/RadixConnectContext';
import Battlefield from './battle/Battlefield';
import PlayerHand from './battle/PlayerHand';
import ActionPanel from './battle/ActionPanel';
import BattleLog from './battle/BattleLog';
import BattleHeader from './battle/BattleHeader';
import DifficultySelector from './battle/DifficultySelector';
import BattleResult from './battle/BattleResult';
import { calculateDerivedStats } from '../utils/battleCalculations';
import { determineAIAction } from '../utils/battleAI';
import { processAttack, applyTool, applySpell, defendCreature } from '../utils/battleCore';
import { generateEnemyCreatures, getDifficultySettings } from '../utils/difficultySettings';

// Action types for our reducer
const ACTIONS = {
  START_BATTLE: 'START_BATTLE',
  DEPLOY_CREATURE: 'DEPLOY_CREATURE',
  ENEMY_DEPLOY_CREATURE: 'ENEMY_DEPLOY_CREATURE',
  UPDATE_CREATURE: 'UPDATE_CREATURE',
  ATTACK: 'ATTACK',
  USE_TOOL: 'USE_TOOL',
  USE_SPELL: 'USE_SPELL',
  DEFEND: 'DEFEND',
  DRAW_CARD: 'DRAW_CARD',
  REGENERATE_ENERGY: 'REGENERATE_ENERGY',
  SET_ACTIVE_PLAYER: 'SET_ACTIVE_PLAYER',
  INCREMENT_TURN: 'INCREMENT_TURN',
  SET_GAME_STATE: 'SET_GAME_STATE',
  APPLY_ONGOING_EFFECTS: 'APPLY_ONGOING_EFFECTS',
  ADD_LOG: 'ADD_LOG'
};

// Battle state reducer to consolidate multiple state updates
const battleReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.START_BATTLE:
      return {
        ...state,
        gameState: 'battle',
        playerDeck: action.playerDeck,
        playerHand: action.playerHand,
        playerField: [],
        enemyDeck: action.enemyDeck,
        enemyHand: action.enemyHand,
        enemyField: [],
        playerEnergy: 10, // Initial energy at start
        enemyEnergy: 10,  // Initial energy at start
        turn: 1,
        activePlayer: 'player',
        battleLog: [{
          id: Date.now(),
          turn: 1,
          message: `Battle started! Difficulty: ${action.difficulty.charAt(0).toUpperCase() + action.difficulty.slice(1)}`
        }],
        playerTools: action.playerTools,
        playerSpells: action.playerSpells
      };
    
    case ACTIONS.DEPLOY_CREATURE:
      return {
        ...state,
        playerHand: state.playerHand.filter(c => c.id !== action.creature.id),
        playerField: [...state.playerField, action.creature],
        playerEnergy: state.playerEnergy - (action.energyCost || action.creature.battleStats.energyCost || 3),
      };
    
    case ACTIONS.ENEMY_DEPLOY_CREATURE:
      // Make sure we're actually deploying the creature
      console.log(`REDUCER: Deploying enemy creature ${action.creature.species_name} to field`);
      
      const newEnemyField = [...state.enemyField, action.creature];
      console.log("Updated enemy field:", newEnemyField);
      
      return {
        ...state,
        enemyHand: state.enemyHand.filter(c => c.id !== action.creature.id),
        enemyField: newEnemyField,
        enemyEnergy: state.enemyEnergy - (action.energyCost || action.creature.battleStats.energyCost || 3),
      };
    
    case ACTIONS.UPDATE_CREATURE:
      if (action.isPlayer) {
        return {
          ...state,
          playerField: state.playerField.map(c => 
            c.id === action.creature.id ? action.creature : c
          )
        };
      } else {
        return {
          ...state,
          enemyField: state.enemyField.map(c => 
            c.id === action.creature.id ? action.creature : c
          )
        };
      }
    
    case ACTIONS.ATTACK:
      const { attackResult } = action;
      const isPlayerAttacker = state.playerField.some(c => c.id === attackResult.updatedAttacker.id);
      const isPlayerDefender = state.playerField.some(c => c.id === attackResult.updatedDefender.id);
      
      return {
        ...state,
        playerField: state.playerField.map(c => {
          if (isPlayerAttacker && c.id === attackResult.updatedAttacker.id) {
            return attackResult.updatedAttacker;
          }
          if (isPlayerDefender && c.id === attackResult.updatedDefender.id) {
            return attackResult.updatedDefender;
          }
          return c;
        }),
        enemyField: state.enemyField.map(c => {
          if (!isPlayerAttacker && c.id === attackResult.updatedAttacker.id) {
            return attackResult.updatedAttacker;
          }
          if (!isPlayerDefender && c.id === attackResult.updatedDefender.id) {
            return attackResult.updatedDefender;
          }
          return c;
        }),
      };
    
    case ACTIONS.USE_TOOL:
      const isPlayerToolTarget = state.playerField.some(c => c.id === action.result.updatedCreature.id);
      return {
        ...state,
        playerField: isPlayerToolTarget
          ? state.playerField.map(c => c.id === action.result.updatedCreature.id ? action.result.updatedCreature : c)
          : state.playerField,
        enemyField: !isPlayerToolTarget
          ? state.enemyField.map(c => c.id === action.result.updatedCreature.id ? action.result.updatedCreature : c)
          : state.enemyField,
        playerTools: state.playerTools.filter(t => t.id !== action.tool.id)
      };
    
    case ACTIONS.USE_SPELL:
      const { spellResult, spell } = action;
      const isPlayerCaster = state.playerField.some(c => c.id === spellResult.updatedCaster.id);
      const isPlayerTarget = state.playerField.some(c => c.id === spellResult.updatedTarget.id);
      
      return {
        ...state,
        playerField: state.playerField.map(c => {
          if (isPlayerCaster && c.id === spellResult.updatedCaster.id) {
            return spellResult.updatedCaster;
          }
          if (isPlayerTarget && c.id === spellResult.updatedTarget.id) {
            return spellResult.updatedTarget;
          }
          return c;
        }),
        enemyField: state.enemyField.map(c => {
          if (!isPlayerCaster && c.id === spellResult.updatedCaster.id) {
            return spellResult.updatedCaster;
          }
          if (!isPlayerTarget && c.id === spellResult.updatedTarget.id) {
            return spellResult.updatedTarget;
          }
          return c;
        }),
        playerEnergy: state.playerEnergy - (action.energyCost || 4),
        playerSpells: state.playerSpells.filter(s => s.id !== spell.id)
      };
    
    case ACTIONS.DEFEND:
      const isPlayerDefending = state.playerField.some(c => c.id === action.updatedCreature.id);
      return {
        ...state,
        playerField: isPlayerDefending
          ? state.playerField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.playerField,
        enemyField: !isPlayerDefending
          ? state.enemyField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.enemyField
      };
    
    case ACTIONS.DRAW_CARD:
      if (action.player === 'player') {
        if (state.playerDeck.length === 0) return state;
        const drawnCard = state.playerDeck[0];
        return {
          ...state,
          playerHand: [...state.playerHand, drawnCard],
          playerDeck: state.playerDeck.slice(1)
        };
      } else {
        if (state.enemyDeck.length === 0) return state;
        const drawnCard = state.enemyDeck[0];
        return {
          ...state,
          enemyHand: [...state.enemyHand, drawnCard],
          enemyDeck: state.enemyDeck.slice(1)
        };
      }
    
    case ACTIONS.REGENERATE_ENERGY:
      // New energy regeneration logic - adds to current energy instead of resetting
      return {
        ...state,
        playerEnergy: Math.min(15, state.playerEnergy + action.playerRegen),
        enemyEnergy: Math.min(15, state.enemyEnergy + action.enemyRegen)
      };
    
    case ACTIONS.SET_ACTIVE_PLAYER:
      return {
        ...state,
        activePlayer: action.player
      };
    
    case ACTIONS.INCREMENT_TURN:
      return {
        ...state,
        turn: state.turn + 1
      };
    
    case ACTIONS.SET_GAME_STATE:
      return {
        ...state,
        gameState: action.gameState
      };
    
    case ACTIONS.APPLY_ONGOING_EFFECTS: {
      // Only update fields if arrays are provided
      const updatedPlayerField = action.updatedPlayerField || 
        state.playerField.filter(c => c.currentHealth > 0);
      
      const updatedEnemyField = action.updatedEnemyField || 
        state.enemyField.filter(c => c.currentHealth > 0);
      
      console.log("APPLY_ONGOING_EFFECTS - Enemy field before:", state.enemyField.length);
      console.log("APPLY_ONGOING_EFFECTS - Enemy field after:", updatedEnemyField.length);
      
      return {
        ...state,
        playerField: updatedPlayerField,
        enemyField: updatedEnemyField
      };
    }
    
    case ACTIONS.ADD_LOG:
      return {
        ...state,
        battleLog: [...state.battleLog, {
          id: Date.now() + Math.random(),
          turn: state.turn,
          message: action.message
        }]
      };
    
    default:
      return state;
  }
};

// ============= CUSTOM AI FUNCTIONS ============= //
// This modified version of determineEasyAIAction ensures we only select affordable creatures
const determineEasyAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  // If no creatures on field and have cards in hand, deploy one
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    // IMPORTANT FIX: Filter for affordable creatures first
    const affordableCreatures = enemyHand.filter(creature => {
      const energyCost = creature.battleStats?.energyCost || 3;
      return energyCost <= enemyEnergy;
    });
    
    // If we have any affordable creatures, deploy one
    if (affordableCreatures.length > 0) {
      // Pick a random affordable creature
      const randomCreature = affordableCreatures[Math.floor(Math.random() * affordableCreatures.length)];
      const energyCost = randomCreature.battleStats?.energyCost || 3;
      
      console.log(`AI can afford to deploy ${randomCreature.species_name} (cost: ${energyCost}, energy: ${enemyEnergy})`);
      
      return {
        type: 'deploy',
        creature: randomCreature,
        energyCost: energyCost
      };
    } else {
      console.log(`AI has creatures in hand but cannot afford any of them (energy: ${enemyEnergy})`);
    }
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

// Custom AI functions for other difficulty levels with affordability check
const determineMediumAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  // Deploy strongest affordable creature from hand if field isn't full
  if (enemyField.length < maxFieldSize && enemyHand.length > 0) {
    // Filter for affordable creatures first
    const affordableCreatures = enemyHand.filter(creature => {
      const energyCost = creature.battleStats?.energyCost || 3;
      return energyCost <= enemyEnergy;
    });
    
    if (affordableCreatures.length > 0) {
      // Find creature with highest combined stats
      const bestCreature = affordableCreatures.reduce((best, current) => {
        if (!current.stats) return best;
        if (!best) return current;
        
        const currentTotal = Object.values(current.stats).reduce((sum, val) => sum + val, 0);
        const bestTotal = best.stats ? Object.values(best.stats).reduce((sum, val) => sum + val, 0) : 0;
        return currentTotal > bestTotal ? current : best;
      }, null);
      
      if (bestCreature) {
        const energyCost = bestCreature.battleStats?.energyCost || 3;
        return {
          type: 'deploy',
          creature: bestCreature,
          energyCost: energyCost
        };
      }
    }
  }
  
  // Rest of medium AI logic (attack, defend, etc.)
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

// Custom determineAIAction that uses our fixed AI functions
const customDetermineAIAction = (
  difficulty, 
  enemyHand, 
  enemyField, 
  playerField, 
  enemyTools, 
  enemySpells, 
  enemyEnergy
) => {
  // Log available resources for debugging
  console.log(`AI Turn - Difficulty: ${difficulty}`);
  console.log(`Energy: ${enemyEnergy}, Hand: ${enemyHand.length}, Field: ${enemyField.length}`);
  
  // Get the max field size based on difficulty
  const maxFieldSize = (() => {
    switch (difficulty) {
      case 'easy': return 3;
      case 'medium': return 4;
      case 'hard': return 5;
      case 'expert': return 6;
      default: return 3;
    }
  })();
  
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
  
  // Use our custom AI functions based on difficulty
  switch (difficulty) {
    case 'easy':
      return determineEasyAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
    case 'medium':
      return determineMediumAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
    // You can add customized hard and expert AI functions here
    case 'hard':
    case 'expert':
    default:
      // Fall back to easy AI for now
      return determineEasyAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
  }
};

const BattleGame = ({ onClose }) => {
  const { creatureNfts, toolNfts, spellNfts, addNotification } = useContext(GameContext);
  const { connected, accounts } = useRadixConnect();
  
  // ========== UI STATE ==========
  const [selectedCreature, setSelectedCreature] = useState(null);
  const [targetCreature, setTargetCreature] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [actionInProgress, setActionInProgress] = useState(false);
  
  // ========== BATTLE STATE (CONSOLIDATED) ==========
  const [state, dispatch] = useReducer(battleReducer, {
    gameState: 'setup', // setup, battle, victory, defeat
    turn: 1,
    activePlayer: 'player', // player or enemy
    
    // Player state
    playerDeck: [],
    playerHand: [],
    playerField: [],
    playerEnergy: 10,
    playerTools: [],
    playerSpells: [],
    
    // Enemy state
    enemyDeck: [],
    enemyHand: [],
    enemyField: [],
    enemyEnergy: 10,
    
    // Battle log
    battleLog: []
  });
  
  // Destructure state for easier access
  const {
    gameState,
    turn,
    activePlayer,
    playerDeck,
    playerHand,
    playerField,
    playerEnergy,
    playerTools,
    playerSpells,
    enemyDeck,
    enemyHand,
    enemyField,
    enemyEnergy,
    battleLog
  } = state;
  
  // ========== INITIALIZATION ==========
  // Initialize player's deck when component mounts
  useEffect(() => {
    if (creatureNfts && creatureNfts.length > 0) {
      // Create battle-ready versions of player creatures
      const battleCreatures = creatureNfts.map(creature => {
        // Calculate derived battle stats
        const derivedStats = calculateDerivedStats(creature);
        
        return {
          ...creature,
          battleStats: derivedStats,
          currentHealth: derivedStats.maxHealth,
          activeEffects: [],
          isDefending: false
        };
      });
    }
  }, [creatureNfts]);
  
  // ========== BATTLE LOG ==========
  // Add entry to battle log (memoized for dependency stability)
  const addToBattleLog = useCallback((message) => {
    dispatch({ type: ACTIONS.ADD_LOG, message });
  }, []);
  
  // ========== BATTLE MECHANICS ==========
  // Regenerate energy at the start of a turn (memoized)
  const regenerateEnergy = useCallback(() => {
    // NEW ENERGY REGENERATION MODEL - per-turn increase instead of reset
    const BASE_REGEN = 4; // Base regeneration per turn
    
    // Calculate player energy bonus from creatures' energy stat
    let playerBonus = 0;
    playerField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        playerBonus += Math.floor(creature.stats.energy * 0.2); // +0.2 per energy point
      }
    });
    
    // Calculate enemy energy bonus from creatures' energy stat
    let enemyBonus = 0;
    enemyField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        enemyBonus += Math.floor(creature.stats.energy * 0.2);
      }
    });
    
    // Total regeneration amounts
    const playerRegen = BASE_REGEN + playerBonus;
    const enemyRegen = BASE_REGEN + enemyBonus;
    
    console.log(`Regenerating energy - Player: +${playerRegen} (base ${BASE_REGEN} + ${playerBonus} bonus), Enemy: +${enemyRegen} (base ${BASE_REGEN} + ${enemyBonus} bonus)`);
    
    // Apply regeneration (cap at 15)
    dispatch({ type: ACTIONS.REGENERATE_ENERGY, playerRegen, enemyRegen });
    
    // Log energy regeneration
    if (activePlayer === 'player') {
      addToBattleLog(`You gained +${playerRegen} energy.`);
    } else {
      addToBattleLog(`Enemy gained +${enemyRegen} energy.`);
    }
  }, [activePlayer, playerField, enemyField, addToBattleLog]);
  
  // Apply ongoing effects (buffs/debuffs/DoT) - memoized with the latest state
  const applyOngoingEffects = useCallback(() => {
    // Get the latest field state for processing
    console.log("Applying ongoing effects - Before: ", {
      playerField: playerField.length,
      enemyField: enemyField.length
    });
    
    // Process player field effects
    const updatedPlayerField = playerField.map(creature => {
      let updatedCreature = { ...creature };
      let effectLog = [];
      
      // Process active effects
      const activeEffects = updatedCreature.activeEffects || [];
      if (activeEffects.length > 0) {
        const expiredEffects = [];
        const remainingEffects = [];
        
        activeEffects.forEach(effect => {
          // Apply effect
          if (effect.healthEffect) {
            // Apply health change
            updatedCreature.currentHealth = Math.min(
              updatedCreature.battleStats.maxHealth,
              Math.max(0, updatedCreature.currentHealth + effect.healthEffect)
            );
            
            // Log health change
            if (effect.healthEffect > 0) {
              effectLog.push(`${updatedCreature.species_name} healed for ${effect.healthEffect} health from ${effect.name}.`);
            } else if (effect.healthEffect < 0) {
              effectLog.push(`${updatedCreature.species_name} took ${Math.abs(effect.healthEffect)} damage from ${effect.name}.`);
            }
          }
          
          // Decrement duration
          const updatedEffect = { ...effect, duration: effect.duration - 1 };
          
          // Check if effect has expired
          if (updatedEffect.duration <= 0) {
            expiredEffects.push(updatedEffect);
          } else {
            remainingEffects.push(updatedEffect);
          }
        });
        
        // Log expired effects
        expiredEffects.forEach(effect => {
          effectLog.push(`${effect.name} effect on ${updatedCreature.species_name} has worn off.`);
        });
        
        // Update creature active effects
        updatedCreature.activeEffects = remainingEffects;
      }
      
      // Reset defending status (lasts only one turn)
      if (updatedCreature.isDefending) {
        updatedCreature.isDefending = false;
        effectLog.push(`${updatedCreature.species_name} is no longer defending.`);
      }
      
      // Log all effects
      effectLog.forEach(message => addToBattleLog(message));
      
      return updatedCreature;
    });
    
    // Process enemy field effects - using the current enemyField
    const updatedEnemyField = enemyField.map(creature => {
      let updatedCreature = { ...creature };
      let effectLog = [];
      
      // Similar processing for enemy creatures
      const activeEffects = updatedCreature.activeEffects || [];
      if (activeEffects.length > 0) {
        const expiredEffects = [];
        const remainingEffects = [];
        
        activeEffects.forEach(effect => {
          // Apply effect
          if (effect.healthEffect) {
            updatedCreature.currentHealth = Math.min(
              updatedCreature.battleStats.maxHealth,
              Math.max(0, updatedCreature.currentHealth + effect.healthEffect)
            );
            
            // Log health change
            if (effect.healthEffect > 0) {
              effectLog.push(`Enemy ${updatedCreature.species_name} healed for ${effect.healthEffect} health from ${effect.name}.`);
            } else if (effect.healthEffect < 0) {
              effectLog.push(`Enemy ${updatedCreature.species_name} took ${Math.abs(effect.healthEffect)} damage from ${effect.name}.`);
            }
          }
          
          // Decrement duration
          const updatedEffect = { ...effect, duration: effect.duration - 1 };
          
          // Check if effect has expired
          if (updatedEffect.duration <= 0) {
            expiredEffects.push(updatedEffect);
          } else {
            remainingEffects.push(updatedEffect);
          }
        });
        
        // Log expired effects
        expiredEffects.forEach(effect => {
          effectLog.push(`${effect.name} effect on enemy ${updatedCreature.species_name} has worn off.`);
        });
        
        // Update creature active effects
        updatedCreature.activeEffects = remainingEffects;
      }
      
      // Reset defending status
      if (updatedCreature.isDefending) {
        updatedCreature.isDefending = false;
        effectLog.push(`Enemy ${updatedCreature.species_name} is no longer defending.`);
      }
      
      // Log all effects
      effectLog.forEach(message => addToBattleLog(message));
      
      return updatedCreature;
    });
    
    console.log("Field size after effects processing, before health filtering:", {
      playerField: updatedPlayerField.length,
      enemyField: updatedEnemyField.length
    });
    
    // Remove only creatures with 0 or less health
    const alivePlayerCreatures = updatedPlayerField.filter(creature => creature.currentHealth > 0);
    const aliveEnemyCreatures = updatedEnemyField.filter(creature => creature.currentHealth > 0);
    
    console.log("Field size after health filtering:", {
      playerField: alivePlayerCreatures.length,
      enemyField: aliveEnemyCreatures.length
    });
    
    // Log defeated creatures
    if (alivePlayerCreatures.length < updatedPlayerField.length) {
      const defeatedCount = updatedPlayerField.length - alivePlayerCreatures.length;
      addToBattleLog(`${defeatedCount} of your creatures were defeated!`);
    }
    
    if (aliveEnemyCreatures.length < updatedEnemyField.length) {
      const defeatedCount = updatedEnemyField.length - aliveEnemyCreatures.length;
      addToBattleLog(`${defeatedCount} enemy creatures were defeated!`);
    }
    
    // Apply the updates to the state
    dispatch({ 
      type: ACTIONS.APPLY_ONGOING_EFFECTS, 
      updatedPlayerField: alivePlayerCreatures, 
      updatedEnemyField: aliveEnemyCreatures
    });
  }, [playerField, enemyField, addToBattleLog]);
  
  // Check for win condition - memoized
  const checkWinCondition = useCallback(() => {
    // Win if all enemy creatures are defeated (both in hand and field)
    return enemyField.length === 0 && enemyHand.length === 0 && enemyDeck.length === 0;
  }, [enemyField, enemyHand, enemyDeck]);
  
  // Check for loss condition - memoized
  const checkLossCondition = useCallback(() => {
    // Lose if all player creatures are defeated (both in hand and field)
    return playerField.length === 0 && playerHand.length === 0 && playerDeck.length === 0;
  }, [playerField, playerHand, playerDeck]);
  
  // ========== PLAYER ACTIONS ==========
  // Deploy a creature from hand to field - memoized
  const deployCreature = useCallback((creature) => {
    if (!creature) return;
    
    // Check if field is full
    if (playerField.length >= 3) {
      addToBattleLog("Your battlefield is full! Cannot deploy more creatures.");
      return;
    }
    
    // Check energy cost
    const energyCost = creature.battleStats.energyCost || 3;
    if (playerEnergy < energyCost) {
      addToBattleLog(`Not enough energy to deploy ${creature.species_name}. Needs ${energyCost} energy.`);
      return;
    }
    
    // Deploy creature
    dispatch({ type: ACTIONS.DEPLOY_CREATURE, creature, energyCost });
    
    // Log deployment
    addToBattleLog(`You deployed ${creature.species_name} to the battlefield! (-${energyCost} energy)`);
    
    console.log(`Deployed ${creature.species_name} to player field`);
  }, [playerField, playerEnergy, addToBattleLog]);
  
  // Attack with a creature - memoized
  const attackCreature = useCallback((attacker, defender) => {
    if (!attacker || !defender) {
      addToBattleLog("Invalid attack - missing attacker or defender");
      return;
    }
    
    // Calculate attack type (physical or magical)
    const attackType = attacker.battleStats.physicalAttack > attacker.battleStats.magicalAttack 
      ? 'physical' 
      : 'magical';
    
    // Process attack
    const attackResult = processAttack(attacker, defender, attackType);
    
    // Update attacker and defender in state
    dispatch({ type: ACTIONS.ATTACK, attackResult });
    
    // Log attack result
    addToBattleLog(attackResult.battleLog);
  }, [addToBattleLog]);
  
  // Use a tool on a creature - memoized
  const useTool = useCallback((tool, targetCreature) => {
    if (!tool || !targetCreature) {
      addToBattleLog("Invalid tool use - missing tool or target");
      return;
    }
    
    // Process tool use
    const result = applyTool(targetCreature, tool);
    
    // Update target creature
    dispatch({ type: ACTIONS.USE_TOOL, result, tool });
    
    // Log tool use
    const isPlayerTarget = playerField.some(c => c.id === targetCreature.id);
    addToBattleLog(
      `${tool.name} was used on ${isPlayerTarget ? '' : 'enemy '}${targetCreature.species_name}.`
    );
  }, [playerField, addToBattleLog]);
  
  // Cast a spell - memoized
  const useSpell = useCallback((spell, caster, target) => {
    if (!spell || !caster) {
      addToBattleLog("Invalid spell cast - missing spell or caster");
      return;
    }
    
    // Check energy cost for spell
    const energyCost = 4; // Base cost for spells
    
    if (playerEnergy < energyCost) {
      addToBattleLog(`Not enough energy to cast ${spell.name}. Needs ${energyCost} energy.`);
      return;
    }
    
    // Process spell cast
    const spellResult = applySpell(caster, target || caster, spell);
    
    // Update caster and target
    dispatch({ type: ACTIONS.USE_SPELL, spellResult, spell, energyCost });
    
    // Log spell cast
    const targetText = target && target.id !== caster.id 
      ? `on ${playerField.some(c => c.id === target.id) ? '' : 'enemy '}${target.species_name}` 
      : '';
      
    addToBattleLog(
      `${caster.species_name} cast ${spell.name} ${targetText}. (-${energyCost} energy)`
    );
  }, [playerEnergy, playerField, addToBattleLog]);
  
  // Put a creature in defensive stance - memoized
  const defendCreatureAction = useCallback((creature) => {
    if (!creature) {
      addToBattleLog("Invalid defend action - no creature selected");
      return;
    }
    
    // Process defend action
    const updatedCreature = defendCreature(creature);
    
    // Update creature in appropriate field
    dispatch({ type: ACTIONS.DEFEND, updatedCreature });
    
    // Log defend action
    const isPlayerCreature = playerField.some(c => c.id === creature.id);
    addToBattleLog(
      `${isPlayerCreature ? '' : 'Enemy '}${creature.species_name} took a defensive stance!`
    );
  }, [playerField, addToBattleLog]);
  
  // ========== BATTLE INITIALIZATION ==========
  // Initialize the battle based on the selected difficulty
  const initializeBattle = useCallback(() => {
    if (!creatureNfts || creatureNfts.length === 0) {
      addNotification("You need creatures to battle!", 400, 300, "#FF5722");
      return;
    }
    
    // Create battle-ready versions of player creatures
    const battleCreatures = creatureNfts.map(creature => {
      // Calculate derived battle stats
      const derivedStats = calculateDerivedStats(creature);
      
      return {
        ...creature,
        battleStats: derivedStats,
        currentHealth: derivedStats.maxHealth,
        activeEffects: [],
        isDefending: false
      };
    });
    
    // Get the difficulty settings
    const diffSettings = getDifficultySettings(difficulty);
    
    // Generate enemy deck based on difficulty
    const enemyCreatures = generateEnemyCreatures(difficulty, diffSettings.enemyDeckSize, battleCreatures);
    
    // Calculate battle stats for enemy creatures and assign more reasonable energy costs
    const enemyWithStats = enemyCreatures.map((creature, index) => {
      const derivedStats = calculateDerivedStats(creature);
      
      // Ensure enemy creatures have reasonable energy costs
      // Assign costs that increase with form and rarity
      let energyCost = 3; // Base cost
      
      // Adjust cost based on form (0-3)
      if (creature.form) {
        energyCost += creature.form;
      }
      
      // Further adjustment based on rarity
      if (creature.rarity === 'Rare') energyCost += 1;
      else if (creature.rarity === 'Epic') energyCost += 2;
      else if (creature.rarity === 'Legendary') energyCost += 3;
      
      // Cap at 9 energy for the most expensive creatures
      energyCost = Math.min(9, energyCost);
      
      // Make first enemy creature very affordable to ensure action on first turn
      if (index === 0) {
        energyCost = 3;
      }
      
      // Update the derived stats with the assigned energy cost
      derivedStats.energyCost = energyCost;
      
      console.log(`Enemy creature: ${creature.species_name}, Form: ${creature.form}, Rarity: ${creature.rarity}, Energy Cost: ${energyCost}`);
      
      return {
        ...creature,
        battleStats: derivedStats,
        currentHealth: derivedStats.maxHealth,
        activeEffects: [],
        isDefending: false
      };
    });
    
    // Draw initial hands
    const playerInitialHand = battleCreatures.slice(0, 3);
    const remainingDeck = battleCreatures.slice(3);
    
    const enemyInitialHandSize = diffSettings.initialHandSize;
    const enemyInitialHand = enemyWithStats.slice(0, enemyInitialHandSize);
    const remainingEnemyDeck = enemyWithStats.slice(enemyInitialHandSize);
    
    // Initialize tools and spells
    const initialPlayerTools = toolNfts || [];
    const initialPlayerSpells = spellNfts || [];
    
    // Initialize the game state
    dispatch({
      type: ACTIONS.START_BATTLE,
      playerDeck: remainingDeck,
      playerHand: playerInitialHand,
      playerTools: initialPlayerTools,
      playerSpells: initialPlayerSpells,
      enemyDeck: remainingEnemyDeck,
      enemyHand: enemyInitialHand,
      difficulty
    });
    
    // Add initial battle log entry
    addToBattleLog('Your turn. Select a creature to deploy or take action!');
  }, [creatureNfts, toolNfts, spellNfts, difficulty, addNotification, addToBattleLog]);
  
  // ========== ENEMY AI ==========
  // Handle the enemy's turn (AI) - memoized
  const handleEnemyTurn = useCallback(() => {
    console.log("Enemy turn processing. Energy:", enemyEnergy, "Hand:", enemyHand.length, "Field:", enemyField.length);
    
    // Use our custom AI function that properly filters affordable creatures
    const aiAction = customDetermineAIAction(
      difficulty, 
      enemyHand, 
      enemyField, 
      playerField,
      [], // Enemy tools not implemented yet
      [], // Enemy spells not implemented yet
      enemyEnergy
    );
    
    console.log("AI decided on action:", aiAction.type);
    
    // Process AI action
    switch(aiAction.type) {
      case 'deploy':
        // Check if we have the creature
        if (!aiAction.creature) {
          console.log("AI Error: No creature to deploy");
          addToBattleLog("Enemy AI error: No creature to deploy");
          break;
        }
        
        // Get energy cost for the creature
        const energyCost = aiAction.energyCost || aiAction.creature.battleStats?.energyCost || 3;
        
        // Double-check if we have enough energy (already should be validated in AI logic now)
        if (enemyEnergy < energyCost) {
          console.log("AI Error: Not enough energy to deploy");
          addToBattleLog("Enemy doesn't have enough energy to deploy");
          break;
        }
        
        console.log("AI deploying creature:", aiAction.creature.species_name, "Cost:", energyCost);
        
        // Deploy the creature
        dispatch({
          type: ACTIONS.ENEMY_DEPLOY_CREATURE,
          creature: aiAction.creature,
          energyCost
        });
        
        // Log deployment
        addToBattleLog(`Enemy deployed ${aiAction.creature.species_name} to the battlefield! (-${energyCost} energy)`);
        
        // Debug logging
        console.log("After deployment - Enemy hand:", enemyHand);
        console.log("After deployment - Enemy energy:", enemyEnergy);
        console.log("After deployment - Enemy field:", enemyField);
        break;
        
      case 'attack':
        // Check if we have the attacker and target
        if (!aiAction.attacker || !aiAction.target) {
          console.log("AI Error: Missing attacker or target");
          addToBattleLog("Enemy AI error: Missing attacker or target");
          break;
        }
        
        console.log("AI attacking with:", aiAction.attacker.species_name, "Target:", aiAction.target.species_name);
        
        // Process attack
        attackCreature(aiAction.attacker, aiAction.target);
        break;
        
      case 'defend':
        // Check if we have the creature
        if (!aiAction.creature) {
          console.log("AI Error: No creature to defend");
          addToBattleLog("Enemy AI error: No creature to defend");
          break;
        }
        
        console.log("AI defending with:", aiAction.creature.species_name);
        
        // Process defend action
        defendCreatureAction(aiAction.creature);
        break;
        
      case 'endTurn':
        console.log("AI ending turn with no action");
        addToBattleLog("Enemy ended their turn.");
        break;
        
      default:
        console.log("Unknown AI action type:", aiAction.type);
        addToBattleLog("Enemy AI error: Invalid action");
    }
  }, [
    difficulty, 
    enemyHand, 
    enemyField, 
    playerField, 
    enemyEnergy,
    addToBattleLog,
    attackCreature,
    defendCreatureAction
  ]);
  
  // ========== TURN PROCESSING ==========
  // Process enemy turn completely
  const processEnemyTurn = useCallback(() => {
    console.log("Starting enemy turn...");
    
    // Execute enemy AI action
    handleEnemyTurn();
    
    // CRITICAL FIX: Use setTimeout to ensure the creature deployment has been processed
    // before applying effects and continuing with the turn
    setTimeout(() => {
      console.log("Now processing effects and finishing turn");
      console.log("Enemy field before effects:", enemyField);
      
      // Check win/loss conditions
      if (checkWinCondition()) {
        dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'victory' });
        addToBattleLog("Victory! You've defeated all enemy creatures!");
        setActionInProgress(false);
        return;
      }
      
      if (checkLossCondition()) {
        dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'defeat' });
        addToBattleLog("Defeat! All your creatures have been defeated!");
        setActionInProgress(false);
        return;
      }
      
      // Apply ongoing effects now that we have the updated state
      applyOngoingEffects();
      
      // Increment turn counter
      dispatch({ type: ACTIONS.INCREMENT_TURN });
      
      // Switch back to player turn
      dispatch({ type: ACTIONS.SET_ACTIVE_PLAYER, player: 'player' });
      
      // Draw card for player if possible
      if (playerHand.length < 5 && playerDeck.length > 0) {
        dispatch({ type: ACTIONS.DRAW_CARD, player: 'player' });
        addToBattleLog(`You drew ${playerDeck[0].species_name}.`);
      }
      
      // Draw card for enemy if possible
      if (enemyHand.length < getDifficultySettings(difficulty).initialHandSize && enemyDeck.length > 0) {
        dispatch({ type: ACTIONS.DRAW_CARD, player: 'enemy' });
        addToBattleLog(`Enemy drew a card.`);
      }
      
      // Regenerate energy (now using our improved model)
      regenerateEnergy();
      
      addToBattleLog(`Turn ${turn + 1} - Your turn.`);
      
      console.log("End of enemy turn - Enemy field:", enemyField);
      
      // Unlock the UI
      setActionInProgress(false);
      
      console.log("Enemy turn complete");
    }, 0); // Zero ms timeout ensures this runs after React updates state
  }, [
    handleEnemyTurn,
    enemyField,
    checkWinCondition,
    checkLossCondition,
    applyOngoingEffects,
    regenerateEnergy,
    playerHand,
    playerDeck,
    enemyHand,
    enemyDeck,
    difficulty,
    turn,
    addToBattleLog
  ]);
  
  // ========== EVENT HANDLERS ==========
  // Handle player action - memoized
  const handlePlayerAction = useCallback((action, targetCreature, sourceCreature) => {
    // Prevent actions during animations or AI turn
    if (actionInProgress || activePlayer !== 'player' || gameState !== 'battle') {
      console.log("Ignoring player action - action in progress or not player turn");
      return;
    }
    
    console.log("Player action:", action.type);
    
    // Clear selections for next action
    const clearSelections = () => {
      setSelectedCreature(null);
      setTargetCreature(null);
    };
    
    // Process player action based on action type
    switch(action.type) {
      case 'deploy':
        setActionInProgress(true);
        deployCreature(sourceCreature);
        clearSelections();
        
        // Release UI lock after a short delay
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'attack':
        setActionInProgress(true);
        attackCreature(sourceCreature, targetCreature);
        clearSelections();
        
        // Release UI lock after a short delay
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'useTool':
        setActionInProgress(true);
        useTool(action.tool, sourceCreature);
        clearSelections();
        
        // Release UI lock after a short delay
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'useSpell':
        setActionInProgress(true);
        useSpell(action.spell, sourceCreature, targetCreature);
        clearSelections();
        
        // Release UI lock after a short delay
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'defend':
        setActionInProgress(true);
        defendCreatureAction(sourceCreature);
        clearSelections();
        
        // Release UI lock after a short delay
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'endTurn':
        // Handle end turn - CRITICAL FIX!
        // Lock the UI during turn transition
        setActionInProgress(true);
        clearSelections();
        
        // First, check if game is over
        if (checkWinCondition()) {
          dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'victory' });
          addToBattleLog("Victory! You've defeated all enemy creatures!");
          setActionInProgress(false);
          return;
        } 
        
        if (checkLossCondition()) {
          dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'defeat' });
          addToBattleLog("Defeat! All your creatures have been defeated!");
          setActionInProgress(false);
          return;
        }
        
        // Apply ongoing effects for player's turn BEFORE switching to enemy
        applyOngoingEffects();
        
        // Set active player to enemy
        dispatch({ type: ACTIONS.SET_ACTIVE_PLAYER, player: 'enemy' });
        addToBattleLog(`Turn ${turn} - Enemy's turn.`);
        
        // CRITICAL FIX: Handle enemy turn with a single timeout
        // This completely bypasses the useEffect pattern and makes the enemy turn deterministic
        setTimeout(() => {
          // Only proceed if game is still in battle state
          if (gameState === 'battle') {
            processEnemyTurn();
          } else {
            setActionInProgress(false);
          }
        }, 750);
        break;
        
      default:
        addToBattleLog('Invalid action');
    }
  }, [
    gameState,
    activePlayer,
    actionInProgress,
    turn,
    deployCreature,
    attackCreature,
    useTool,
    useSpell,
    defendCreatureAction,
    checkWinCondition,
    checkLossCondition,
    applyOngoingEffects,
    addToBattleLog,
    processEnemyTurn
  ]);
  
  // Handle creature selection
  const handleCreatureSelect = useCallback((creature, isEnemy) => {
    // Cannot select creatures during AI turn
    if (activePlayer !== 'player' || actionInProgress) return;
    
    if (isEnemy) {
      // If selecting an enemy creature, set it as the target
      setTargetCreature(prevTarget => {
        // Toggle target selection if clicking the same creature
        return prevTarget && prevTarget.id === creature.id ? null : creature;
      });
    } else {
      // If selecting a player creature, set it as the selected creature
      setSelectedCreature(prevSelected => {
        // Toggle selection if clicking the same creature
        return prevSelected && prevSelected.id === creature.id ? null : creature;
      });
    }
  }, [activePlayer, actionInProgress]);
  
  // Handle card selection from hand
  const handleSelectCard = useCallback((creature) => {
    // Cannot select cards during AI turn
    if (activePlayer !== 'player' || actionInProgress) return;
    
    setSelectedCreature(prevSelected => {
      // Toggle selection if clicking the same card
      return prevSelected && prevSelected.id === creature.id ? null : creature;
    });
    setTargetCreature(null);
  }, [activePlayer, actionInProgress]);
  
  // Get available actions for the selected creature
  const getAvailableActions = useCallback((selectedCreature, targetCreature) => {
    if (!selectedCreature) return [];
    
    const actions = [];
    
    // If creature is in hand, it can be deployed
    if (playerHand.some(c => c.id === selectedCreature.id)) {
      actions.push('deploy');
    }
    
    // If creature is on the field, it can attack, defend, or be targeted by tools/spells
    if (playerField.some(c => c.id === selectedCreature.id)) {
      // Can attack if an enemy target is selected
      if (targetCreature && enemyField.some(c => c.id === targetCreature.id)) {
        actions.push('attack');
      }
      
      // Can use tools if available
      if (playerTools.length > 0) {
        actions.push('useTool');
      }
      
      // Can use spells if available
      if (playerSpells.length > 0) {
        actions.push('useSpell');
      }
      
      // Can always defend
      actions.push('defend');
    }
    
    // Can always end turn
    actions.push('endTurn');
    
    return actions;
  }, [playerHand, playerField, enemyField, playerTools, playerSpells]);
  
  // ========== EFFECTS ==========
  // Effect to handle game state changes, victory/defeat conditions
  useEffect(() => {
    if (gameState !== 'battle') return;
    
    // Check win/loss conditions after every state change
    if (checkWinCondition()) {
      dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'victory' });
      addToBattleLog("Victory! You've defeated all enemy creatures!");
    } else if (checkLossCondition()) {
      dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'defeat' });
      addToBattleLog("Defeat! All your creatures have been defeated!");
    }
  }, [gameState, checkWinCondition, checkLossCondition, addToBattleLog]);
  
  // ========== RENDER ==========
  return (
    <div className="battle-game-overlay">
      <div className="battle-game">
        {gameState === 'setup' && (
          <DifficultySelector 
            onSelectDifficulty={setDifficulty} 
            onStartBattle={initializeBattle}
            creatureCount={creatureNfts?.length || 0} 
            difficulty={difficulty}
          />
        )}
        
        {gameState === 'battle' && (
          <>
            <BattleHeader 
              turn={turn} 
              playerEnergy={playerEnergy} 
              enemyEnergy={enemyEnergy}
              difficulty={difficulty}
              activePlayer={activePlayer}
            />
            
            <div className="battlefield-container">
              <Battlefield 
                playerField={playerField}
                enemyField={enemyField}
                activePlayer={activePlayer}
                difficulty={difficulty}
                onCreatureSelect={handleCreatureSelect}
                selectedCreature={selectedCreature}
                targetCreature={targetCreature}
              />
            </div>
            
            <PlayerHand 
              hand={playerHand}
              onSelectCard={handleSelectCard}
              disabled={activePlayer !== 'player' || actionInProgress}
              selectedCreature={selectedCreature}
            />
            
            <ActionPanel 
              selectedCreature={selectedCreature}
              targetCreature={targetCreature}
              availableActions={getAvailableActions(selectedCreature, targetCreature)}
              onAction={handlePlayerAction}
              disabled={activePlayer !== 'player' || actionInProgress}
              availableTools={playerTools}
              availableSpells={playerSpells}
            />
            
            <BattleLog log={battleLog} />
          </>
        )}
        
        {(gameState === 'victory' || gameState === 'defeat') && (
          <BattleResult 
            result={gameState} 
            onPlayAgain={() => dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'setup' })}
            onClose={onClose}
            stats={{
              turns: turn,
              remainingCreatures: playerField.length + playerHand.length,
              enemiesDefeated: enemyDeck.length - (enemyField.length + enemyHand.length)
            }}
            difficulty={difficulty}
          />
        )}
      </div>
    </div>
  );
};

export default BattleGame;
