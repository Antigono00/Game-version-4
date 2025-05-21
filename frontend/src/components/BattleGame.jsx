// src/components/BattleGame.jsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
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


const BattleGame = ({ onClose }) => {
  const { creatureNfts, toolNfts, spellNfts, addNotification } = useContext(GameContext);
  const { connected, accounts } = useRadixConnect();
  
  // ========== GAME STATE ==========
  const [gameState, setGameState] = useState('setup'); // setup, battle, victory, defeat
  const [difficulty, setDifficulty] = useState('easy');
  const [turn, setTurn] = useState(1);
  const [activePlayer, setActivePlayer] = useState('player'); // player or enemy
  const [actionInProgress, setActionInProgress] = useState(false);
  
  // ========== PLAYER STATE ==========
  const [playerDeck, setPlayerDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [playerField, setPlayerField] = useState([]);
  const [playerEnergy, setPlayerEnergy] = useState(10);
  const [playerTools, setPlayerTools] = useState([]);
  const [playerSpells, setPlayerSpells] = useState([]);
  
  // ========== ENEMY STATE ==========
  const [enemyDeck, setEnemyDeck] = useState([]);
  const [enemyHand, setEnemyHand] = useState([]);
  const [enemyField, setEnemyField] = useState([]);
  const [enemyEnergy, setEnemyEnergy] = useState(10);
  
  // ========== SELECTION STATE ==========
  const [selectedCreature, setSelectedCreature] = useState(null);
  const [targetCreature, setTargetCreature] = useState(null);
  
  // ========== BATTLE LOG ==========
  const [battleLog, setBattleLog] = useState([]);
  
  // Add entry to battle log
  const addToBattleLog = (message) => {
    setBattleLog(prev => [...prev, { id: Date.now(), message, turn }]);
  };
  
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
      
      setPlayerDeck(battleCreatures);
    }
    
    // Initialize tools and spells
    if (toolNfts && toolNfts.length > 0) {
      setPlayerTools(toolNfts);
    }
    
    if (spellNfts && spellNfts.length > 0) {
      setPlayerSpells(spellNfts);
    }
  }, [creatureNfts, toolNfts, spellNfts]);
  
  // Initialize the battle based on the selected difficulty
  const initializeBattle = () => {
    if (playerDeck.length === 0) {
      addNotification("You need creatures to battle!", 400, 300, "#FF5722");
      return;
    }
    
    // Get the difficulty settings
    const diffSettings = getDifficultySettings(difficulty);
    
    // Generate enemy deck based on difficulty - use the enemyDeckSize setting
    const enemyCreatures = generateEnemyCreatures(difficulty, diffSettings.enemyDeckSize, playerDeck);
    
    // Calculate battle stats for enemy creatures
    const enemyWithStats = enemyCreatures.map(creature => {
      const derivedStats = calculateDerivedStats(creature);
      return {
        ...creature,
        battleStats: derivedStats,
        currentHealth: derivedStats.maxHealth,
        activeEffects: [],
        isDefending: false
      };
    });
    
    // Draw initial hands
    const playerInitialHand = playerDeck.slice(0, 3);
    const remainingDeck = playerDeck.slice(3);
    
    const enemyInitialHandSize = diffSettings.initialHandSize;
    const enemyInitialHand = enemyWithStats.slice(0, enemyInitialHandSize);
    const remainingEnemyDeck = enemyWithStats.slice(enemyInitialHandSize);
    
    // Initialize the game state
    setEnemyDeck(remainingEnemyDeck);
    setEnemyHand(enemyInitialHand);
    setPlayerDeck(remainingDeck);
    setPlayerHand(playerInitialHand);
    setPlayerField([]);
    setEnemyField([]);
    setPlayerEnergy(10);
    setEnemyEnergy(10);
    setTurn(1);
    setActivePlayer('player');
    setGameState('battle');
    
    // Reset battle log
    setBattleLog([{
      id: Date.now(),
      turn: 1,
      message: `Battle started! Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`
    }]);
    
    // Add initial battle log entry
    addToBattleLog('Your turn. Select a creature to deploy or take action!');
  };
  
  // ========== BATTLE MECHANICS ==========
  // Regenerate energy at the start of a turn
  const regenerateEnergy = () => {
    const diffSettings = getDifficultySettings(difficulty);
    
    // Calculate player energy regen
    let playerRegen = 3; // Base regen
    playerField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        playerRegen += Math.floor(creature.stats.energy * 0.2); // +0.2 per energy point
      }
    });
    
    // Calculate enemy energy regen
    let enemyRegen = diffSettings.enemyEnergyRegen;
    
    // Apply regeneration (cap at 15)
    setPlayerEnergy(prev => Math.min(15, prev + playerRegen));
    setEnemyEnergy(prev => Math.min(15, prev + enemyRegen));
    
    // Log energy regeneration
    if (activePlayer === 'player') {
      addToBattleLog(`You gained +${playerRegen} energy.`);
    } else {
      addToBattleLog(`Enemy gained +${enemyRegen} energy.`);
    }
  };
  
  // Apply ongoing effects (buffs/debuffs/DoT)
  const applyOngoingEffects = () => {
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
    
    // Process enemy field effects
    const updatedEnemyField = enemyField.map(creature => {
      let updatedCreature = { ...creature };
      let effectLog = [];
      
      // Similar processing for enemy creatures
      const activeEffects = updatedCreature.activeEffects || [];
      if (activeEffects.length > 0) {
        const expiredEffects = [];
        const remainingEffects = [];
        
        activeEffects.forEach(effect => {
          // Apply effect (similar to player creatures)
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
    
    // Update fields
    setPlayerField(updatedPlayerField);
    setEnemyField(updatedEnemyField);
    
    // Remove defeated creatures
    const alivePlayerCreatures = updatedPlayerField.filter(creature => creature.currentHealth > 0);
    const aliveEnemyCreatures = updatedEnemyField.filter(creature => creature.currentHealth > 0);
    
    // Log defeated creatures
    if (alivePlayerCreatures.length < updatedPlayerField.length) {
      const defeatedCount = updatedPlayerField.length - alivePlayerCreatures.length;
      addToBattleLog(`${defeatedCount} of your creatures were defeated!`);
    }
    
    if (aliveEnemyCreatures.length < updatedEnemyField.length) {
      const defeatedCount = updatedEnemyField.length - aliveEnemyCreatures.length;
      addToBattleLog(`${defeatedCount} enemy creatures were defeated!`);
    }
    
    setPlayerField(alivePlayerCreatures);
    setEnemyField(aliveEnemyCreatures);
  };
  
  // ========== PLAYER ACTIONS ==========
  // Deploy a creature from hand to field
  const deployCreature = (creature) => {
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
    
    // Remove creature from hand
    const updatedHand = playerHand.filter(c => c.id !== creature.id);
    setPlayerHand(updatedHand);
    
    // Add creature to field
    setPlayerField(prev => [...prev, creature]);
    
    // Deduct energy
    setPlayerEnergy(prev => prev - energyCost);
    
    // Log deployment
    addToBattleLog(`You deployed ${creature.species_name} to the battlefield! (-${energyCost} energy)`);
  };
  
  // Attack with a creature
  const attackCreature = (attacker, defender) => {
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
    
    // Update attacker
    const isPlayerAttacker = playerField.some(c => c.id === attacker.id);
    
    // Update attacker in appropriate field
    if (isPlayerAttacker) {
      setPlayerField(prev => 
        prev.map(c => c.id === attacker.id ? attackResult.updatedAttacker : c)
      );
    } else {
      setEnemyField(prev => 
        prev.map(c => c.id === attacker.id ? attackResult.updatedAttacker : c)
      );
    }
    
    // Update defender
    const isPlayerDefender = playerField.some(c => c.id === defender.id);
    
    if (isPlayerDefender) {
      setPlayerField(prev => 
        prev.map(c => c.id === defender.id ? attackResult.updatedDefender : c)
      );
    } else {
      setEnemyField(prev => 
        prev.map(c => c.id === defender.id ? attackResult.updatedDefender : c)
      );
    }
    
    // Log attack result
    addToBattleLog(attackResult.battleLog);
    
    // Clear selections
    setSelectedCreature(null);
    setTargetCreature(null);
  };
  
  // Use a tool on a creature
  const useTool = (tool, targetCreature) => {
    if (!tool || !targetCreature) {
      addToBattleLog("Invalid tool use - missing tool or target");
      return;
    }
    
    // Process tool use
    const result = applyTool(targetCreature, tool);
    
    // Update target creature
    const isPlayerTarget = playerField.some(c => c.id === targetCreature.id);
    
    if (isPlayerTarget) {
      setPlayerField(prev => 
        prev.map(c => c.id === targetCreature.id ? result.updatedCreature : c)
      );
    } else {
      setEnemyField(prev => 
        prev.map(c => c.id === targetCreature.id ? result.updatedCreature : c)
      );
    }
    
    // Log tool use
    addToBattleLog(
      `${tool.name} was used on ${isPlayerTarget ? '' : 'enemy '}${targetCreature.species_name}.`
    );
    
    // Remove tool from inventory (one-time use)
    setPlayerTools(prev => prev.filter(t => t.id !== tool.id));
    
    // Clear selections
    setSelectedCreature(null);
    setTargetCreature(null);
  };
  
  // Cast a spell
  const useSpell = (spell, caster, target) => {
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
    const result = applySpell(caster, target || caster, spell);
    
    // Update caster
    const isPlayerCaster = playerField.some(c => c.id === caster.id);
    
    if (isPlayerCaster) {
      setPlayerField(prev => 
        prev.map(c => c.id === caster.id ? result.updatedCaster : c)
      );
    } else {
      setEnemyField(prev => 
        prev.map(c => c.id === caster.id ? result.updatedCaster : c)
      );
    }
    
    // Update target if different from caster
    if (target && target.id !== caster.id) {
      const isPlayerTarget = playerField.some(c => c.id === target.id);
      
      if (isPlayerTarget) {
        setPlayerField(prev => 
          prev.map(c => c.id === target.id ? result.updatedTarget : c)
        );
      } else {
        setEnemyField(prev => 
          prev.map(c => c.id === target.id ? result.updatedTarget : c)
        );
      }
    }
    
    // Deduct energy
    setPlayerEnergy(prev => prev - energyCost);
    
    // Log spell cast
    const targetText = target && target.id !== caster.id 
      ? `on ${playerField.some(c => c.id === target.id) ? '' : 'enemy '}${target.species_name}` 
      : '';
      
    addToBattleLog(
      `${caster.species_name} cast ${spell.name} ${targetText}. (-${energyCost} energy)`
    );
    
    // Remove spell from inventory (one-time use)
    setPlayerSpells(prev => prev.filter(s => s.id !== spell.id));
    
    // Clear selections
    setSelectedCreature(null);
    setTargetCreature(null);
  };
  
  // Put a creature in defensive stance
  const defendCreatureAction = (creature) => {
    if (!creature) {
      addToBattleLog("Invalid defend action - no creature selected");
      return;
    }
    
    // Process defend action
    const updatedCreature = defendCreature(creature);
    
    // Update creature in appropriate field
    const isPlayerCreature = playerField.some(c => c.id === creature.id);
    
    if (isPlayerCreature) {
      setPlayerField(prev => 
        prev.map(c => c.id === creature.id ? updatedCreature : c)
      );
    } else {
      setEnemyField(prev => 
        prev.map(c => c.id === creature.id ? updatedCreature : c)
      );
    }
    
    // Log defend action
    addToBattleLog(
      `${isPlayerCreature ? '' : 'Enemy '}${creature.species_name} took a defensive stance!`
    );
    
    // Clear selections
    setSelectedCreature(null);
    setTargetCreature(null);
  };
  
  // ========== TURN MANAGEMENT ==========
  // Check for win/loss conditions
  const checkWinCondition = () => {
    // Win if all enemy creatures are defeated (both in hand and field)
    return enemyField.length === 0 && enemyHand.length === 0 && enemyDeck.length === 0;
  };
  
  const checkLossCondition = () => {
    // Lose if all player creatures are defeated (both in hand and field)
    return playerField.length === 0 && playerHand.length === 0 && playerDeck.length === 0;
  };
  
    
  // Handle the enemy's turn (AI)
  const handleEnemyTurn = useCallback(() => {
    console.log("Enemy turn triggered. Energy:", enemyEnergy, "Hand:", enemyHand.length, "Field:", enemyField.length);
    
    // Determine AI action based on difficulty
    const aiAction = determineAIAction(
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
        
        // Double-check if we have enough energy (this is also checked in determineAIAction)
        if (enemyEnergy < energyCost) {
          console.log("AI Error: Not enough energy to deploy");
          addToBattleLog("Enemy doesn't have enough energy to deploy");
          break;
        }
        
        console.log("AI deploying creature:", aiAction.creature.species_name, "Cost:", energyCost);
        
        // Deduct energy
        setEnemyEnergy(prev => Math.max(0, prev - energyCost));
        
        // Remove creature from enemy hand
        const updatedHand = enemyHand.filter(c => c.id !== aiAction.creature.id);
        setEnemyHand(updatedHand);
        
        // Add creature to enemy field
        setEnemyField(prev => [...prev, aiAction.creature]);
        
        // Log deployment
        addToBattleLog(`Enemy deployed ${aiAction.creature.species_name} to the battlefield! (-${energyCost} energy)`);
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
  
  // ========== EVENT HANDLERS ==========
  // Handle player action
  const handlePlayerAction = useCallback((action, targetCreature, sourceCreature) => {
    // Prevent actions during animations or AI turn
    if (actionInProgress || activePlayer !== 'player') {
      console.log("Ignoring player action - action in progress or not player turn");
      return;
    }
    
    console.log("Player action:", action.type);
    
    // Set action in progress
    setActionInProgress(true);
    
    // Process player action based on action type
    switch(action.type) {
      case 'deploy':
        deployCreature(sourceCreature);
        break;
      case 'attack':
        attackCreature(sourceCreature, targetCreature);
        break;
      case 'useTool':
        useTool(action.tool, sourceCreature);
        break;
      case 'useSpell':
        useSpell(action.spell, sourceCreature, targetCreature);
        break;
      case 'defend':
        defendCreatureAction(sourceCreature);
        break;
      case 'endTurn':
        // Handle end turn directly here
        if (checkWinCondition()) {
          setGameState('victory');
          addToBattleLog("Victory! You've defeated all enemy creatures!");
        } else if (checkLossCondition()) {
          setGameState('defeat');
          addToBattleLog("Defeat! All your creatures have been defeated!");
        } else {
          // End player turn
          setActivePlayer('enemy');
          addToBattleLog(`Turn ${turn} - Enemy's turn.`);
        }
        break;
      default:
        addToBattleLog('Invalid action');
    }
    
    // Clear action in progress with a short delay for visual feedback
    setTimeout(() => {
      setActionInProgress(false);
    }, 300);
  }, [
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
    addToBattleLog
  ]);
  
  // Handle creature selection
  const handleCreatureSelect = (creature, isEnemy) => {
    // Cannot select creatures during AI turn
    if (activePlayer !== 'player') return;
    
    if (isEnemy) {
      // If selecting an enemy creature, set it as the target
      setTargetCreature(creature);
    } else {
      // If selecting a player creature, set it as the selected creature
      setSelectedCreature(creature);
    }
  };
  
  // Handle card selection from hand
  const handleSelectCard = (creature) => {
    // Cannot select cards during AI turn
    if (activePlayer !== 'player') return;
    
    setSelectedCreature(creature);
    setTargetCreature(null);
  };
  
  // Get available actions for the selected creature
  const getAvailableActions = (selectedCreature, targetCreature) => {
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
  };
  
  // ========== EFFECTS ==========
  // Effect to handle game state changes, victory/defeat conditions
  useEffect(() => {
    if (gameState !== 'battle') return;
    
    // Check win/loss conditions after every state change
    if (checkWinCondition()) {
      setGameState('victory');
      addToBattleLog("Victory! You've defeated all enemy creatures!");
    } else if (checkLossCondition()) {
      setGameState('defeat');
      addToBattleLog("Defeat! All your creatures have been defeated!");
    }
  }, [gameState, enemyField, enemyHand, enemyDeck, playerField, playerHand, playerDeck]);
  
  // Effect to handle enemy turn
  useEffect(() => {
    // Only run this effect when it's the enemy's turn and game is in battle state
    if (gameState !== 'battle' || activePlayer !== 'enemy') {
      return;
    }
    
    console.log("Enemy turn effect triggered. Action in progress:", actionInProgress);
    
    // Only proceed if an action is not already in progress
    if (actionInProgress) {
      return;
    }
    
    // Set action in progress to prevent multiple triggers
    setActionInProgress(true);
    
    // Add a delay for visual feedback
    const timeoutId = setTimeout(() => {
      try {
        console.log("Executing enemy turn...");
        
        // Handle enemy turn
        handleEnemyTurn();
        
        // Wait a moment, then end enemy turn
        setTimeout(() => {
          console.log("Ending enemy turn...");
          
          // Check game state again for win/loss conditions after enemy action
          if (checkWinCondition()) {
            console.log("Victory condition met after enemy turn");
            setGameState('victory');
            addToBattleLog("Victory! You've defeated all enemy creatures!");
          } else if (checkLossCondition()) {
            console.log("Defeat condition met after enemy turn");
            setGameState('defeat');
            addToBattleLog("Defeat! All your creatures have been defeated!");
          } else {
            // End enemy turn normally
            // Increment turn counter
            setTurn(prev => prev + 1);
            
            // Switch to player turn
            setActivePlayer('player');
            
            // Apply turn effects
            applyOngoingEffects();
            
            // Draw card for player if possible
            if (playerHand.length < 5 && playerDeck.length > 0) {
              const drawnCard = playerDeck[0];
              setPlayerHand(prev => [...prev, drawnCard]);
              setPlayerDeck(prev => prev.slice(1));
              addToBattleLog(`You drew ${drawnCard.species_name}.`);
            }
            
            // Draw card for enemy if possible
            if (enemyHand.length < getDifficultySettings(difficulty).initialHandSize && enemyDeck.length > 0) {
              const drawnCard = enemyDeck[0];
              setEnemyHand(prev => [...prev, drawnCard]);
              setEnemyDeck(prev => prev.slice(1));
              addToBattleLog(`Enemy drew a card.`);
            }
            
            // Regenerate energy
            regenerateEnergy();
            
            addToBattleLog(`Turn ${turn + 1} - Your turn.`);
          }
          
          // Clear action in progress flag
          setActionInProgress(false);
        }, 500);
      } catch (error) {
        console.error("Error during enemy turn:", error);
        
        // If there's an error, still end the turn
        setActivePlayer('player');
        setTurn(prev => prev + 1);
        addToBattleLog("Enemy turn encountered an error. Your turn now.");
        setActionInProgress(false);
      }
    }, 750);
    
    return () => clearTimeout(timeoutId);
  }, [
    gameState, 
    activePlayer, 
    actionInProgress, 
    handleEnemyTurn,
    checkWinCondition,
    checkLossCondition,
    playerHand,
    playerDeck,
    enemyHand,
    enemyDeck,
    difficulty,
    turn,
    applyOngoingEffects,
    regenerateEnergy,
    addToBattleLog
  ]);

  // ========== RENDER ==========
  return (
    <div className="battle-game-overlay">
      <div className="battle-game">
        {gameState === 'setup' && (
          <DifficultySelector 
            onSelectDifficulty={setDifficulty} 
            onStartBattle={initializeBattle}
            creatureCount={playerDeck.length + playerHand.length + playerField.length} 
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
            onPlayAgain={() => setGameState('setup')}
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
