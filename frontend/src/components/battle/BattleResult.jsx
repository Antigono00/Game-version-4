// src/components/battle/BattleResult.jsx
import React from 'react';

const BattleResult = ({ result, onPlayAgain, onClose, stats, difficulty }) => {
  const isVictory = result === 'victory';
  
  const getDifficultyColor = (diff) => {
    switch (diff) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FFC107';
      case 'hard': return '#FF9800';
      case 'expert': return '#FF5722';
      default: return '#4CAF50';
    }
  };
  
  return (
    <div className={`battle-result ${isVictory ? 'victory' : 'defeat'}`}>
      <div className="result-header" 
        style={{ backgroundColor: isVictory ? '#4CAF50' : '#F44336' }}>
        <h2>{isVictory ? 'Victory!' : 'Defeat!'}</h2>
      </div>
      
      <div className="result-content">
        <div className="result-message">
          {isVictory ? (
            <p>You've defeated all enemy creatures! Your strategy and creatures have proven superior.</p>
          ) : (
            <p>All your creatures have been defeated. Better luck next time!</p>
          )}
        </div>
        
        <div className="battle-stats">
          <h3>Battle Statistics</h3>
          
          <div className="stat-grid">
            <div className="stat-item">
              <div className="stat-label">Difficulty</div>
              <div className="stat-value" style={{ color: getDifficultyColor(difficulty) }}>
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </div>
            </div>
            
            <div className="stat-item">
              <div className="stat-label">Turns</div>
              <div className="stat-value">{stats.turns}</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-label">Creatures Remaining</div>
              <div className="stat-value">{stats.remainingCreatures}</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-label">Enemies Defeated</div>
              <div className="stat-value">{stats.enemiesDefeated}</div>
            </div>
          </div>
          
          {isVictory && (
            <div className="rewards-section">
              <h3>Rewards</h3>
              <p>Experience gained for all participating creatures!</p>
              {/* In the future, can add actual rewards here */}
            </div>
          )}
        </div>
      </div>
      
      <div className="result-actions">
        <button 
          className="play-again-btn"
          onClick={onPlayAgain}
          style={{ backgroundColor: isVictory ? '#4CAF50' : '#F44336' }}
        >
          Play Again
        </button>
        
        <button 
          className="close-btn"
          onClick={onClose}
        >
          Return to Game
        </button>
      </div>
    </div>
  );
};

export default BattleResult;
