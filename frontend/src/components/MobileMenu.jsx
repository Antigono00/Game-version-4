import { useContext } from 'react';
import { GameContext } from '../context/GameContext';

const MobileMenu = ({ isOpen, setIsOpen }) => {
  const { tcorvax, catNips, energy, eggs, formatResource, isMobile } = useContext(GameContext);

  // Don't show the mobile menu button on desktop
  if (!isMobile) {
    return null;
  }

  return (
    <>
      {/* Mobile burger menu button */}
      <button 
        className="mobile-menu-btn" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          zIndex: 10001 // Keep this the highest z-index
        }}
      >
        ≡ Menu
      </button>
      
      {/* Mobile mini-HUD - hide when menu is open */}
      {!isOpen && (
        <div className="mobile-hud" style={{
          display: 'flex',
          flexWrap: 'wrap',
          position: 'fixed',
          top: '60px',
          left: '10px',
          right: '10px',
          height: 'auto',
          minHeight: '40px',
          zIndex: 8000, // Below messages and side panel
          padding: '5px',
          background: 'rgba(0, 0, 0, 0.95)',
          borderRadius: '10px',
          margin: 0,
          border: '1px solid rgba(76, 175, 80, 0.3)',
          boxShadow: '0 5px 10px rgba(0, 0, 0, 0.3)'
        }}>
          <div className="mobile-resource">
            💎 <span id="mobile-tcorvax">{formatResource(tcorvax)}</span>
          </div>
          <div className="mobile-resource">
            🐱 <span id="mobile-catnips">{formatResource(catNips)}</span>
          </div>
          <div className="mobile-resource">
            ⚡ <span id="mobile-energy">{formatResource(energy)}</span>
          </div>
          <div className="mobile-resource">
            🥚 <span id="mobile-eggs">{formatResource(eggs)}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileMenu;
