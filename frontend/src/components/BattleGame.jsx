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

// Constants for battle mechanics
const ATTACK_ENERGY_COST = 2; // Energy cost for attacks
const DEFEND_ENERGY_COST = 1; // Energy cost for defending
const BASE_ENERGY_REGEN = 4; // Base energy regeneration per turn
const ENERGY_STAT_MULTIPLIER = 0.1; // Reduced from 0.2 to 0.1 per energy point

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
  ADD_LOG: 'ADD_LOG',
  SPEND_ENERGY: 'SPEND_ENERGY' // New action to spend energy
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
      
      // Spend energy for attack - depending on who's attacking
      const updatedPlayerEnergy = isPlayerAttacker 
        ? state.playerEnergy - action.energyCost 
        : state.playerEnergy;
        
      const updatedEnemyEnergy = !isPlayerAttacker 
        ? state.enemyEnergy - action.energyCost 
        : state.enemyEnergy;
      
      return {
        ...state,
        playerEnergy: updatedPlayerEnergy,
        enemyEnergy: updatedEnemyEnergy,
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
      
      // Spend energy for defend based on who's defending
      const playerEnergyAfterDefend = isPlayerDefending 
        ? state.playerEnergy - DEFEND_ENERGY_COST 
        : state.playerEnergy;
        
      const enemyEnergyAfterDefend = !isPlayerDefending 
        ? state.enemyEnergy - DEFEND_ENERGY_COST 
        : state.enemyEnergy;
      
      return {
        ...state,
        playerEnergy: playerEnergyAfterDefend,
        enemyEnergy: enemyEnergyAfterDefend,
        playerField: isPlayerDefending
          ? state.playerField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.playerField,
        enemyField: !isPlayerDefending
          ? state.enemyField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.enemyField
      };
    
    case ACTIONS.SPEND_ENERGY:
      // General action for spending energy
      if (action.player === 'player') {
        return {
          ...state,
          playerEnergy: Math.max(0, state.playerEnergy - action.amount)
        };
      } else {
        return {
          ...state,
          enemyEnergy: Math.max(0, state.enemyEnergy - action.amount)
        };
      }
    
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
      // Reduced energy regeneration from creature stats
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
      // Process player field effects
      const processedPlayerField = state.playerField.map(creature => {
        let updatedCreature = { ...creature };
        
        // Process active effects
        const activeEffects = updatedCreature.activeEffects || [];
        if (activeEffects.length > 0) {
          const remainingEffects = [];
          let effectLog = [];
          
          activeEffects.forEach(effect => {
            // Apply effect
            if (effect.healthEffect) {
              // Apply health change
              const previousHealth = updatedCreature.currentHealth;
              updatedCreature.currentHealth = Math.min(
                updatedCreature.battleStats.maxHealth,
                Math.max(0, updatedCreature.currentHealth + effect.healthEffect)
              );
              
              // Log health changes for UI feedback
              const healthChange = updatedCreature.currentHealth - previousHealth;
              if (healthChange !== 0) {
                const changeType = healthChange > 0 ? 'healed' : 'damaged';
                const amount = Math.abs(healthChange);
                effectLog.push(`${updatedCreature.species_name} ${changeType} for ${amount} from ${effect.name}`);
              }
            }
            
            // Apply stat effects if any
            if (effect.statEffect) {
              // Apply stats
              Object.entries(effect.statEffect).forEach(([stat, value]) => {
                if (updatedCreature.battleStats[stat] !== undefined) {
                  updatedCreature.battleStats[stat] += value;
                }
              });
            }
            
            // Decrement duration
            const updatedEffect = { ...effect, duration: effect.duration - 1 };
            
            // Keep effect if duration is still > 0
            if (updatedEffect.duration > 0) {
              remainingEffects.push(updatedEffect);
            } else {
              effectLog.push(`${effect.name} effect has expired on ${updatedCreature.species_name}`);
            }
          });
          
          // Update creature active effects
          updatedCreature.activeEffects = remainingEffects;
          
          // Add effect log to state for UI feedback
          if (effectLog.length > 0 && action.addLog) {
            action.addLog(effectLog.join('. '));
          }
        }
        
        // Reset defending status (lasts only one turn)
        if (updatedCreature.isDefending) {
          updatedCreature.isDefending = false;
        }
        
        return updatedCreature;
      });
      
      // Process enemy field effects - important to use the current state from the reducer
      const processedEnemyField = state.enemyField.map(creature => {
        let updatedCreature = { ...creature };
        
        // Process active effects
        const activeEffects = updatedCreature.activeEffects || [];
        if (activeEffects.length > 0) {
          const remainingEffects = [];
          let effectLog = [];
          
          activeEffects.forEach(effect => {
            // Apply effect
            if (effect.healthEffect) {
              // Apply health change
              const previousHealth = updatedCreature.currentHealth;
              updatedCreature.currentHealth = Math.min(
                updatedCreature.battleStats.maxHealth,
                Math.max(0, updatedCreature.currentHealth + effect.healthEffect)
              );
              
              // Log health changes for UI feedback
              const healthChange = updatedCreature.currentHealth - previousHealth;
              if (healthChange !== 0) {
                const changeType = healthChange > 0 ? 'healed' : 'damaged';
                const amount = Math.abs(healthChange);
                effectLog.push(`Enemy ${updatedCreature.species_name} ${changeType} for ${amount} from ${effect.name}`);
              }
            }
            
            // Apply stat effects if any
            if (effect.statEffect) {
              // Apply stats
              Object.entries(effect.statEffect).forEach(([stat, value]) => {
                if (updatedCreature.battleStats[stat] !== undefined) {
                  updatedCreature.battleStats[stat] += value;
                }
              });
            }
            
            // Decrement duration
            const updatedEffect = { ...effect, duration: effect.duration - 1 };
            
            // Keep effect if duration is still > 0
            if (updatedEffect.duration > 0) {
              remainingEffects.push(updatedEffect);
            } else {
              effectLog.push(`${effect.name} effect has expired on Enemy ${updatedCreature.species_name}`);
            }
          });
          
          // Update creature active effects
          updatedCreature.activeEffects = remainingEffects;
          
          // Add effect log to state for UI feedback
          if (effectLog.length > 0 && action.addLog) {
            action.addLog(effectLog.join('. '));
          }
        }
        
        // Reset defending status
        if (updatedCreature.isDefending) {
          updatedCreature.isDefending = false;
        }
        
        return updatedCreature;
      });
      
      // Filter out defeated creatures (those with health <= 0)
      const updatedPlayerField = action.updatedPlayerField || 
        processedPlayerField.filter(c => c.currentHealth > 0);
      
      const updatedEnemyField = action.updatedEnemyField || 
        processedEnemyField.filter(c => c.currentHealth > 0);
      
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
// Enhanced AI for Easy difficulty - fixed to always attack when possible
const determineEasyAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  // ========== DEPLOYMENT LOGIC ==========
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
  
  // ========== ATTACK LOGIC ==========
  // If we have creatures on field and player has creatures, we can attack!
  if (enemyField.length > 0 && playerField.length > 0) {
    console.log(`AI has ${enemyField.length} creatures on field and player has ${playerField.length} creatures`);
    
    // Check if we have enough energy to attack
    if (enemyEnergy >= ATTACK_ENERGY_COST) {
      console.log(`AI has ${enemyEnergy} energy, which is enough to attack (cost: ${ATTACK_ENERGY_COST})`);
      
      // Detailed creature logging
      console.log("AI creatures on field:", enemyField.map(c => ({
        name: c.species_name,
        atk: Math.max(c.battleStats?.physicalAttack || 0, c.battleStats?.magicalAttack || 0),
        def: Math.min(c.battleStats?.physicalDefense || 0, c.battleStats?.magicalDefense || 0),
        hp: c.currentHealth,
        isDefending: c.isDefending
      })));
      
      console.log("Player creatures on field:", playerField.map(c => ({
        name: c.species_name,
        atk: Math.max(c.battleStats?.physicalAttack || 0, c.battleStats?.magicalAttack || 0),
        def: Math.min(c.battleStats?.physicalDefense || 0, c.battleStats?.magicalDefense || 0),
        hp: c.currentHealth
      })));
      
      // Find a good attacker - preferably not already defending
      const nonDefendingCreatures = enemyField.filter(c => !c.isDefending);
      
      // Choose the best attacker - either a non-defending one, or any if all are defending
      const attackerPool = nonDefendingCreatures.length > 0 ? nonDefendingCreatures : enemyField;
      
      // Find the strongest attacker in the available pool
      const bestAttacker = attackerPool.reduce((best, current) => {
        if (!best) return current;
        
        const currentAttack = Math.max(
          current.battleStats?.physicalAttack || 0,
          current.battleStats?.magicalAttack || 0
        );
        
        const bestAttack = Math.max(
          best.battleStats?.physicalAttack || 0,
          best.battleStats?.magicalAttack || 0
        );
        
        return currentAttack > bestAttack ? current : best;
      }, null);
      
      // Find the most vulnerable target
      const weakestTarget = playerField.reduce((weakest, current) => {
        if (!weakest) return current;
        
        // Consider both health and defense when determining vulnerability
        const currentDefense = Math.min(
          current.battleStats?.physicalDefense || 0,
          current.battleStats?.magicalDefense || 0
        );
        
        const weakestDefense = Math.min(
          weakest.battleStats?.physicalDefense || 0,
          weakest.battleStats?.magicalDefense || 0
        );
        
        // Weight health more heavily than defense
        const currentVulnerability = (current.currentHealth * 2) + currentDefense;
        const weakestVulnerability = (weakest.currentHealth * 2) + weakestDefense;
        
        return currentVulnerability < weakestVulnerability ? current : weakest;
      }, null);
      
      // Generate random number once for decision making
      const attackRoll = Math.random();
      console.log(`Attack probability check: ${attackRoll} < 0.8 = ${attackRoll < 0.8}`);
      
      // 80% chance to attack in easy mode - INCREASING from 60% to ensure more attacks
      if (attackRoll < 0.8) {
        console.log(`AI attacking with ${bestAttacker.species_name} targeting ${weakestTarget.species_name}`);
        return {
          type: 'attack',
          attacker: bestAttacker,
          target: weakestTarget,
          energyCost: ATTACK_ENERGY_COST
        };
      }
      
      // Only defend if needed (low health or player has high attack)
      const needsDefending = enemyField.find(creature => {
        // Check if creature health is low
        const isLowHealth = creature.currentHealth < (creature.battleStats.maxHealth * 0.3);
        
        // Check if player has high attack creatures
        const playerHasHighAttack = playerField.some(playerCreature => {
          const playerAttack = Math.max(
            playerCreature.battleStats?.physicalAttack || 0,
            playerCreature.battleStats?.magicalAttack || 0
          );
          
          return playerAttack > (creature.battleStats?.physicalDefense || 0);
        });
        
        return (isLowHealth || playerHasHighAttack) && !creature.isDefending;
      });
      
      // If someone needs defending and we have the energy, defend
      if (needsDefending && enemyEnergy >= DEFEND_ENERGY_COST) {
        console.log(`AI defending with ${needsDefending.species_name} because it's vulnerable`);
        return {
          type: 'defend',
          creature: needsDefending,
          energyCost: DEFEND_ENERGY_COST
        };
      }
      
      // Default to attack if we got this far
      console.log(`AI attacking by default with ${bestAttacker.species_name} targeting ${weakestTarget.species_name}`);
      return {
        type: 'attack',
        attacker: bestAttacker,
        target: weakestTarget,
        energyCost: ATTACK_ENERGY_COST
      };
    } else {
      console.log(`AI doesn't have enough energy to attack. Has ${enemyEnergy}, needs ${ATTACK_ENERGY_COST}`);
      
      // Not enough energy to attack, see if we can defend
      if (enemyEnergy >= DEFEND_ENERGY_COST) {
        const randomCreature = enemyField[Math.floor(Math.random() * enemyField.length)];
        if (!randomCreature.isDefending) {
          return {
            type: 'defend',
            creature: randomCreature,
            energyCost: DEFEND_ENERGY_COST
          };
        }
      }
    }
  } else {
    console.log(`No valid attack possible: AI has ${enemyField.length} creatures, player has ${playerField.length} creatures`);
  }
  
  // If creatures on field but player has none, just end turn
  if (enemyField.length > 0 && playerField.length === 0) {
    return { type: 'endTurn' };
  }
  
  // If no valid action, end turn
  return { type: 'endTurn' };
};

// Improved medium difficulty AI
const determineMediumAIAction = (enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize) => {
  console.log("Running medium AI logic...");
  
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
        console.log(`Medium AI deploying ${bestCreature.species_name} (cost: ${energyCost})`);
        return {
          type: 'deploy',
          creature: bestCreature,
          energyCost: energyCost
        };
      }
    }
  }
  
  // Check if we have enough energy to attack and there are valid targets
  if (enemyField.length > 0 && playerField.length > 0) {
    console.log(`Medium AI considering attack with ${enemyField.length} creatures against ${playerField.length} player creatures`);
    
    if (enemyEnergy >= ATTACK_ENERGY_COST) {
      console.log(`Medium AI has ${enemyEnergy} energy, enough to attack (cost: ${ATTACK_ENERGY_COST})`);
      
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
      
      // Check if any creature needs defending (health below 40%)
      const creatureNeedsDefending = enemyField.find(creature => 
        !creature.isDefending && 
        creature.currentHealth < (creature.battleStats.maxHealth * 0.4)
      );
      
      // 90% chance to attack in medium mode, unless a creature needs defending
      const attackRoll = Math.random();
      const willAttack = !creatureNeedsDefending || attackRoll < 0.9;
      
      console.log(`Medium AI attack probability check: ${attackRoll} < 0.9 = ${attackRoll < 0.9}, will attack: ${willAttack}`);
      
      if (willAttack) {
        if (bestAttacker && weakestTarget) {
          console.log(`Medium AI attacking with ${bestAttacker.species_name} targeting ${weakestTarget.species_name}`);
          return {
            type: 'attack',
            attacker: bestAttacker,
            target: weakestTarget,
            energyCost: ATTACK_ENERGY_COST
          };
        }
      }
      
      // If creature needs defending and we have energy, defend
      if (creatureNeedsDefending && enemyEnergy >= DEFEND_ENERGY_COST) {
        console.log(`Medium AI defending with ${creatureNeedsDefending.species_name} due to low health`);
        return {
          type: 'defend',
          creature: creatureNeedsDefending,
          energyCost: DEFEND_ENERGY_COST
        };
      } else {
        // Default to attack if we have attackers and targets
        if (bestAttacker && weakestTarget) {
          console.log(`Medium AI defaulting to attack with ${bestAttacker.species_name}`);
          return {
            type: 'attack',
            attacker: bestAttacker,
            target: weakestTarget,
            energyCost: ATTACK_ENERGY_COST
          };
        }
      }
    } else {
      console.log(`Medium AI doesn't have enough energy to attack (has ${enemyEnergy}, needs ${ATTACK_ENERGY_COST})`);
    }
  } else {
    console.log(`Medium AI can't attack: AI has ${enemyField.length} creatures, player has ${playerField.length} creatures`);
  }
  
  // Defend with low health creatures if we have energy
  if (enemyField.length > 0 && enemyEnergy >= DEFEND_ENERGY_COST) {
    // Find creature with lowest health percentage
    const lowestHealthCreature = enemyField.reduce((lowest, current) => {
      if (!current.battleStats || current.isDefending) return lowest;
      if (!lowest) return current;
      
      const currentHealthPercent = current.currentHealth / current.battleStats.maxHealth;
      const lowestHealthPercent = lowest.currentHealth / lowest.battleStats.maxHealth;
      return currentHealthPercent < lowestHealthPercent ? current : lowest;
    }, null);
    
    if (lowestHealthCreature && lowestHealthCreature.currentHealth / lowestHealthCreature.battleStats.maxHealth < 0.5) {
      console.log(`Medium AI defending with ${lowestHealthCreature.species_name} due to low health percentage`);
      return {
        type: 'defend',
        creature: lowestHealthCreature,
        energyCost: DEFEND_ENERGY_COST
      };
    }
  }
  
  // If no valid action, end turn
  console.log("Medium AI ending turn with no action");
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
  
  // IMPROVED SAFEGUARD: Only check truly impossible situations
  if (
    // No energy and no creatures on field = can't do anything
    (enemyEnergy <= 0 && enemyField.length === 0) ||
    // No cards in hand AND no creatures on field = can't do anything
    (enemyHand.length === 0 && enemyField.length === 0) ||
    // No enemy energy, no creatures in hand, and no player creatures to attack = can't do anything
    (enemyEnergy <= 0 && enemyHand.length === 0 && playerField.length === 0)
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
      // Fall back to medium AI for hard/expert until better AI is implemented
      return determineMediumAIAction(enemyHand, enemyField, playerField, enemyEnergy, maxFieldSize);
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
    // REDUCED ENERGY REGENERATION MODEL (multiplier reduced from 0.2 to 0.1)
    
    // Calculate player energy bonus from creatures' energy stat
    let playerBonus = 0;
    playerField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        playerBonus += Math.floor(creature.stats.energy * ENERGY_STAT_MULTIPLIER); // Reduced from 0.2 to 0.1
      }
    });
    
    // Calculate enemy energy bonus from creatures' energy stat
    let enemyBonus = 0;
    enemyField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        enemyBonus += Math.floor(creature.stats.energy * ENERGY_STAT_MULTIPLIER); // Reduced from 0.2 to 0.1
      }
    });
    
    // Total regeneration amounts
    const playerRegen = BASE_ENERGY_REGEN + playerBonus;
    const enemyRegen = BASE_ENERGY_REGEN + enemyBonus;
    
    console.log(`Regenerating energy - Player: +${playerRegen} (base ${BASE_ENERGY_REGEN} + ${playerBonus} bonus), Enemy: +${enemyRegen} (base ${BASE_ENERGY_REGEN} + ${enemyBonus} bonus)`);
    
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
    // We'll now use an approach that doesn't rely on potentially stale state
    
    console.log("Initiating ongoing effects application...");
    
    // Instead of manipulating the fields directly, just dispatch the action
    // The reducer will have the most up-to-date state and can handle the logic
    dispatch({ 
      type: ACTIONS.APPLY_ONGOING_EFFECTS,
      addLog: addToBattleLog // Pass the log function to the reducer
    });
    
    // Log any defeated creatures in the next render cycle
    // This ensures we're seeing the effects after they've been applied
    setTimeout(() => {
      console.log("Ongoing effects applied - Current field sizes:", {
        playerField: playerField.length,
        enemyField: enemyField.length
      });
    }, 0);
  }, [dispatch, addToBattleLog, playerField, enemyField]);
  
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
    
    // Check if attacker has enough energy
    const isPlayerAttacker = playerField.some(c => c.id === attacker.id);
    if (isPlayerAttacker && playerEnergy < ATTACK_ENERGY_COST) {
      addToBattleLog(`Not enough energy to attack. Needs ${ATTACK_ENERGY_COST} energy.`);
      return;
    }
    
    // Calculate attack type (physical or magical)
    const attackType = attacker.battleStats.physicalAttack > attacker.battleStats.magicalAttack 
      ? 'physical' 
      : 'magical';
    
    // Process attack
    const attackResult = processAttack(attacker, defender, attackType);
    
    // Update attacker and defender in state
    dispatch({ 
      type: ACTIONS.ATTACK, 
      attackResult,
      energyCost: ATTACK_ENERGY_COST // Add energy cost for the attack
    });
    
    // Log attack result and energy cost
    const energyMessage = isPlayerAttacker ? ` (-${ATTACK_ENERGY_COST} energy)` : '';
    addToBattleLog(attackResult.battleLog + energyMessage);
  }, [playerField, playerEnergy, addToBattleLog]);
  
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
    
    // Process spell cast with fixed implementation
    const spellResult = applySpell(caster, target || caster, spell);
    
    if (!spellResult) {
      addToBattleLog(`Failed to cast ${spell.name}.`);
      return;
    }
    
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
    
    // Check if player has enough energy for defending
    const isPlayerCreature = playerField.some(c => c.id === creature.id);
    if (isPlayerCreature && playerEnergy < DEFEND_ENERGY_COST) {
      addToBattleLog(`Not enough energy to defend. Needs ${DEFEND_ENERGY_COST} energy.`);
      return;
    }
    
    // Process defend action
    const updatedCreature = defendCreature(creature);
    
    // Update creature in appropriate field with energy cost
    dispatch({ type: ACTIONS.DEFEND, updatedCreature });
    
    // Log defend action with energy cost
    const energyCost = isPlayerCreature ? ` (-${DEFEND_ENERGY_COST} energy)` : '';
    addToBattleLog(
      `${isPlayerCreature ? '' : 'Enemy '}${creature.species_name} took a defensive stance!${energyCost}`
    );
  }, [playerField, playerEnergy, addToBattleLog]);
  
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
      
      // Apply enemy stats multiplier based on difficulty for stronger enemies
      const statsMultiplier = diffSettings.enemyStatsMultiplier || 1.0;
      
      // Apply the multiplier to make enemies stronger
      Object.keys(derivedStats).forEach(stat => {
        // Skip energyCost and special stats
        if (stat !== 'energyCost' && stat !== 'criticalChance' && stat !== 'dodgeChance') {
          derivedStats[stat] = Math.round(derivedStats[stat] * statsMultiplier);
        }
      });
      
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
    
    // Use our custom AI function that properly filters affordable creatures and considers energy costs
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
        
        // Check if AI has enough energy to attack
        if (enemyEnergy < (aiAction.energyCost || ATTACK_ENERGY_COST)) {
          console.log("AI Error: Not enough energy to attack");
          addToBattleLog("Enemy doesn't have enough energy to attack");
          break;
        }
        
        console.log("AI attacking with:", aiAction.attacker.species_name, "Target:", aiAction.target.species_name);
        
        // Process attack with energy cost
        attackCreature(aiAction.attacker, aiAction.target);
        break;
        
      case 'defend':
        // Check if we have the creature
        if (!aiAction.creature) {
          console.log("AI Error: No creature to defend");
          addToBattleLog("Enemy AI error: No creature to defend");
          break;
        }
        
        // Check if AI has enough energy to defend
        if (enemyEnergy < (aiAction.energyCost || DEFEND_ENERGY_COST)) {
          console.log("AI Error: Not enough energy to defend");
          addToBattleLog("Enemy doesn't have enough energy to defend");
          break;
        }
        
        console.log("AI defending with:", aiAction.creature.species_name);
        
        // Process defend action with energy cost
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
    
    // Need to capture current state values to ensure AI makes decisions based on current data
    const currentEnemyHand = [...enemyHand];
    const currentEnemyField = [...enemyField];
    const currentPlayerField = [...playerField];
    const currentEnemyEnergy = enemyEnergy;
    
    // Function to handle the rest of the turn AFTER the AI action is processed
    const finishEnemyTurn = () => {
      console.log("Now processing effects and finishing turn");
      
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
      
      // Critical fix: Don't use the pre-captured enemyField here
      // Instead, let the reducer use its current state by not providing specific field updates
      dispatch({ type: ACTIONS.APPLY_ONGOING_EFFECTS });
      
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
      
      // Regenerate energy
      regenerateEnergy();
      
      addToBattleLog(`Turn ${turn + 1} - Your turn.`);
      
      // Unlock the UI
      setActionInProgress(false);
      
      console.log("Enemy turn complete");
    };
    
    // Use our custom AI function with the captured current state
    const aiAction = customDetermineAIAction(
      difficulty, 
      currentEnemyHand, 
      currentEnemyField, 
      currentPlayerField,
      [], // Enemy tools not implemented yet
      [], // Enemy spells not implemented yet
      currentEnemyEnergy
    );
    
    console.log("AI decided on action:", aiAction.type);
    
    // Process AI action
    switch(aiAction.type) {
      case 'deploy': 
        if (!aiAction.creature) {
          console.log("AI Error: No creature to deploy");
          addToBattleLog("Enemy AI error: No creature to deploy");
          finishEnemyTurn();
          break;
        }
        
        const energyCost = aiAction.energyCost || aiAction.creature.battleStats?.energyCost || 3;
        
        if (currentEnemyEnergy < energyCost) {
          console.log("AI Error: Not enough energy to deploy");
          addToBattleLog("Enemy doesn't have enough energy to deploy");
          finishEnemyTurn();
          break;
        }
        
        console.log("AI deploying creature:", aiAction.creature.species_name, "Cost:", energyCost);
        
        dispatch({
          type: ACTIONS.ENEMY_DEPLOY_CREATURE,
          creature: aiAction.creature,
          energyCost
        });
        
        addToBattleLog(`Enemy deployed ${aiAction.creature.species_name} to the battlefield! (-${energyCost} energy)`);
        
        // Critical fix: Wait for deployment to finish before continuing with turn processing
        setTimeout(finishEnemyTurn, 100);
        break;
        
      case 'attack':
        if (!aiAction.attacker || !aiAction.target) {
          console.log("AI Error: Missing attacker or target");
          addToBattleLog("Enemy AI error: Missing attacker or target");
          finishEnemyTurn();
          break;
        }
        
        // Check energy cost for attack
        const attackCost = aiAction.energyCost || ATTACK_ENERGY_COST;
        
        if (currentEnemyEnergy < attackCost) {
          console.log("AI Error: Not enough energy to attack");
          addToBattleLog("Enemy doesn't have enough energy to attack");
          finishEnemyTurn();
          break;
        }
        
        console.log("AI attacking with:", aiAction.attacker.species_name, "Target:", aiAction.target.species_name);
        
        // Process attack with energy cost
        const attackResult = processAttack(aiAction.attacker, aiAction.target);
        
        dispatch({
          type: ACTIONS.ATTACK,
          attackResult,
          energyCost: attackCost
        });
        
        // Log attack
        addToBattleLog(`${attackResult.battleLog} (-${attackCost} energy)`);
        
        // Wait for attack to finish before continuing
        setTimeout(finishEnemyTurn, 100);
        break;
        
      case 'defend':
        if (!aiAction.creature) {
          console.log("AI Error: No creature to defend");
          addToBattleLog("Enemy AI error: No creature to defend");
          finishEnemyTurn();
          break;
        }
        
        // Check energy cost for defend
        const defendCost = aiAction.energyCost || DEFEND_ENERGY_COST;
        
        if (currentEnemyEnergy < defendCost) {
          console.log("AI Error: Not enough energy to defend");
          addToBattleLog("Enemy doesn't have enough energy to defend");
          finishEnemyTurn();
          break;
        }
        
        console.log("AI defending with:", aiAction.creature.species_name);
        
        // Process defend with energy cost
        const updatedDefender = defendCreature(aiAction.creature);
        
        dispatch({
          type: ACTIONS.DEFEND,
          updatedCreature: updatedDefender
        });
        
        // Log defend
        addToBattleLog(`Enemy ${aiAction.creature.species_name} took a defensive stance! (-${defendCost} energy)`);
        
        // Wait for defend to finish before continuing
        setTimeout(finishEnemyTurn, 100);
        break;
        
      case 'endTurn':
        console.log("AI ending turn with no action");
        addToBattleLog("Enemy ended their turn.");
        finishEnemyTurn();
        break;
        
      default:
        console.log("Unknown AI action type:", aiAction.type);
        addToBattleLog("Enemy AI error: Invalid action");
        finishEnemyTurn();
    }
  }, [
    difficulty, 
    enemyHand, 
    enemyField, 
    playerField, 
    enemyEnergy,
    playerHand,
    playerDeck,
    enemyDeck,
    turn,
    addToBattleLog,
    checkWinCondition,
    checkLossCondition,
    regenerateEnergy
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
        // Check if player has enough energy to attack
        if (playerEnergy < ATTACK_ENERGY_COST) {
          addToBattleLog(`Not enough energy to attack. Needs ${ATTACK_ENERGY_COST} energy.`);
          return;
        }
        
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
        // Check if player has enough energy to defend
        if (playerEnergy < DEFEND_ENERGY_COST) {
          addToBattleLog(`Not enough energy to defend. Needs ${DEFEND_ENERGY_COST} energy.`);
          return;
        }
        
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
        dispatch({ type: ACTIONS.APPLY_ONGOING_EFFECTS });
        
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
    playerEnergy,
    deployCreature,
    attackCreature,
    useTool,
    useSpell,
    defendCreatureAction,
    checkWinCondition,
    checkLossCondition,
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
      // Can attack if an enemy target is selected and we have enough energy
      if (targetCreature && enemyField.some(c => c.id === targetCreature.id) && playerEnergy >= ATTACK_ENERGY_COST) {
        actions.push('attack');
      }
      
      // Can use tools if available
      if (playerTools.length > 0) {
        actions.push('useTool');
      }
      
      // Can use spells if available and enough energy
      if (playerSpells.length > 0 && playerEnergy >= 4) {
        actions.push('useSpell');
      }
      
      // Can defend if have enough energy
      if (playerEnergy >= DEFEND_ENERGY_COST) {
        actions.push('defend');
      }
    }
    
    // Can always end turn
    actions.push('endTurn');
    
    return actions;
  }, [playerHand, playerField, enemyField, playerTools, playerSpells, playerEnergy]);
  
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
