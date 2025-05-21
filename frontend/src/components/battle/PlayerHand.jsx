// src/components/battle/PlayerHand.jsx
import React from 'react';
import CreatureCard from './CreatureCard';

const PlayerHand = ({ hand, onSelectCard, disabled }) => {
  return (
    <div className={`player-hand ${disabled ? 'disabled' : ''}`}>
      <div className="hand-title">Your Hand</div>
      <div className="hand-cards">
        {hand.map(creature => (
          <CreatureCard
            key={creature.id}
            creature={creature}
            position="hand"
            isActive={!disabled}
            onClick={() => onSelectCard(creature)}
            size="small"
          />
        ))}
        {hand.length === 0 && (
          <div className="empty-hand">No creatures in hand</div>
        )}
      </div>
    </div>
  );
};

export default PlayerHand;
