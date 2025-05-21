// src/components/battle/ActionPanel.jsx
import React, { useState } from 'react';
import ToolSpellModal from './ToolSpellModal';

const ActionPanel = ({ 
  selectedCreature, 
  targetCreature, 
  availableActions, 
  onAction, 
  disabled,
  availableTools,
  availableSpells
}) => {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showSpellsModal, setShowSpellsModal] = useState(false);
  
  if (!selectedCreature) {
    return (
      <div className="action-panel">
        <div className="action-info">
          Select a creature to perform actions
        </div>
      </div>
    );
  }
  
  return (
    <div className={`action-panel ${disabled ? 'disabled' : ''}`}>
      <div className="selected-info">
        <span className="selected-label">Selected:</span>
        <span className="selected-name">{selectedCreature.species_name}</span>
        {targetCreature && (
          <>
            <span className="target-label">Target:</span>
            <span className="target-name">{targetCreature.species_name}</span>
          </>
        )}
      </div>
      
      <div className="action-buttons">
        {availableActions.includes('deploy') && (
          <button 
            className="action-btn deploy"
            onClick={() => onAction({ type: 'deploy' }, null, selectedCreature)}
            disabled={disabled}
          >
            Deploy Creature
          </button>
        )}
        
        {availableActions.includes('attack') && (
          <button 
            className="action-btn attack"
            onClick={() => onAction({ type: 'attack' }, targetCreature, selectedCreature)}
            disabled={disabled || !targetCreature}
          >
            Attack
          </button>
        )}
        
        {availableActions.includes('useTool') && (
          <button 
            className="action-btn tool"
            onClick={() => setShowToolsModal(true)}
            disabled={disabled || availableTools.length === 0}
          >
            Use Tool
          </button>
        )}
        
        {availableActions.includes('useSpell') && (
          <button 
            className="action-btn spell"
            onClick={() => setShowSpellsModal(true)}
            disabled={disabled || availableSpells.length === 0}
          >
            Cast Spell
          </button>
        )}
        
        {availableActions.includes('defend') && (
          <button 
            className="action-btn defend"
            onClick={() => onAction({ type: 'defend' }, null, selectedCreature)}
            disabled={disabled}
          >
            Defend
          </button>
        )}
        
        <button 
          className="action-btn end-turn"
          onClick={() => onAction({ type: 'endTurn' })}
          disabled={disabled}
        >
          End Turn
        </button>
      </div>
      
      {/* Tool selection modal */}
      {showToolsModal && (
        <ToolSpellModal 
          items={availableTools}
          type="tool"
          onSelect={(tool) => {
            setShowToolsModal(false);
            onAction({ type: 'useTool', tool }, targetCreature, selectedCreature);
          }}
          onClose={() => setShowToolsModal(false)}
        />
      )}
      
      {/* Spell selection modal */}
      {showSpellsModal && (
        <ToolSpellModal 
          items={availableSpells}
          type="spell"
          onSelect={(spell) => {
            setShowSpellsModal(false);
            onAction({ type: 'useSpell', spell }, targetCreature, selectedCreature);
          }}
          onClose={() => setShowSpellsModal(false)}
        />
      )}
    </div>
  );
};

export default ActionPanel;
