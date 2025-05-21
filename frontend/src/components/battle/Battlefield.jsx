// src/components/battle/Battlefield.jsx - Fixed to handle variable field size
import React from 'react';
import CreatureCard from './CreatureCard';

// Helper function to get max field size based on difficulty
const getMaxFieldSize = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 3;
    case 'medium': return 4;
    case 'hard': return 5;
    case 'expert': return 6;
    default: return 3;
  }
};

const Battlefield = ({ 
  playerField = [], 
  enemyField = [], 
  activePlayer,
  difficulty = 'easy',
  onCreatureSelect,
  selectedCreature,
  targetCreature 
}) => {
  // Use dynamic max field size based on difficulty
  const maxEnemyFieldSize = getMaxFieldSize(difficulty);
  const maxPlayerFieldSize = 3; // Player is always limited to 3 for balance
  
  // Determine if we should apply the large-field class based on enemy field size
  const enemyFieldClass = maxEnemyFieldSize > 3 ? 'battlefield-enemy large-field' : 'battlefield-enemy';
  
  return (
    <div className="battlefield">
      {/* Enemy field (top) */}
      <div className={enemyFieldClass}>
        {enemyField.map((creature) => (
          <CreatureCard 
            key={creature.id}
            creature={creature}
            position="enemy"
            isActive={activePlayer === 'enemy'}
            isSelected={targetCreature && targetCreature.id === creature.id}
            isDefending={creature.isDefending}
            activeEffects={creature.activeEffects || []}
            onClick={() => onCreatureSelect(creature, true)}
          />
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, maxEnemyFieldSize - enemyField.length) }).map((_, index) => (
          <div key={`empty-enemy-${index}`} className="creature-slot empty" />
        ))}
      </div>
      
      {/* Center battlefield section - could contain battlefield effects */}
      <div className="battlefield-center">
        {activePlayer === 'player' 
          ? "👉 Your turn - select a creature to act" 
          : "Enemy is thinking..."}
      </div>
      
      {/* Player field (bottom) */}
      <div className="battlefield-player">
        {playerField.map((creature) => (
          <CreatureCard 
            key={creature.id}
            creature={creature}
            position="player"
            isActive={activePlayer === 'player'}
            isSelected={selectedCreature && selectedCreature.id === creature.id}
            isDefending={creature.isDefending}
            activeEffects={creature.activeEffects || []}
            onClick={() => onCreatureSelect(creature, false)}
          />
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, maxPlayerFieldSize - playerField.length) }).map((_, index) => (
          <div key={`empty-player-${index}`} className="creature-slot empty" />
        ))}
      </div>
    </div>
  );
};

export default Battlefield;
