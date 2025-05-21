// src/components/battle/BattleLog.jsx
import React, { useRef, useEffect } from 'react';

const BattleLog = ({ log }) => {
  const logEndRef = useRef(null);
  
  // Auto-scroll to the latest log entry
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log]);
  
  return (
    <div className="battle-log">
      <div className="log-title">Battle Log</div>
      <div className="log-entries">
        {log.map(entry => (
          <div key={entry.id} className="log-entry">
            <span className="turn-indicator">[Turn {entry.turn}]</span>
            <span className="log-message">{entry.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default BattleLog;
