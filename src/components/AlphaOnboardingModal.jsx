import React, { useState, useEffect } from 'react';
import CanvasModal from './CanvasModal';

/**
 * Alpha Onboarding Modal
 * A specialized CanvasModal that welcomes users to Redstring's open alpha
 * Inherits all CanvasModal functionality while providing alpha-specific content
 */
const AlphaOnboardingModal = ({
  isVisible,
  onClose,
  onDontShowAgain = null,
  ...canvasModalProps
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Check if user has already seen this modal
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSeen = localStorage.getItem('redstring-alpha-welcome-seen') === 'true';
      if (hasSeen && !isVisible) {
        // User has seen it before and it's not being forcibly shown
        return;
      }
    }
  }, [isVisible]);

  const handleClose = () => {
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem('redstring-alpha-welcome-seen', 'true');
      onDontShowAgain && onDontShowAgain();
    }
    onClose();
  };

  const modalContent = (
    <div style={{
      padding: '24px', // More generous padding with taller modal
      boxSizing: 'border-box',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Close button in top right */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: '#666',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '4px',
          fontSize: '16px',
          fontWeight: 'bold',
          fontFamily: "'EmOne', sans-serif",
          zIndex: 10
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#260000'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
      >
        ✕
      </button>

      {/* Welcome Header */}
      <div style={{ textAlign: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <h2 style={{
          margin: '0 0 6px 0',
          color: '#260000',
          fontSize: '1.4rem',
          fontWeight: 'bold',
          fontFamily: "'EmOne', sans-serif"
        }}>
          Welcome to Redstring
        </h2>
        <div style={{
          margin: '0 0 6px 0',
          fontSize: '0.8rem',
          color: '#716C6C',
          fontFamily: "'EmOne', sans-serif"
        }}>
          Open Alpha
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          lineHeight: '1.4',
          marginBottom: '12px',
          fontFamily: "'EmOne', sans-serif"
        }}
      >
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '0.95rem',
          color: '#333',
          fontFamily: "'EmOne', sans-serif"
        }}>
          <strong>Redstring</strong> is an open knowledge graph platform that lets you build, connect, and explore
          ideas through semantic relationships. We're currently in <strong>open alpha</strong>, which means
          you're one of the first people to experience this new way of working with information.
        </p>

                <div style={{
          backgroundColor: 'transparent',
          padding: '12px',
          marginBottom: '12px'
        }}>
          <h4 style={{
            margin: '0 0 8px 0',
            color: '#8B0000',
            fontSize: '1rem',
            fontWeight: 'bold',
            fontFamily: "'EmOne', sans-serif"
          }}>
            Features
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '16px',
            fontSize: '0.85rem',
            color: '#333',
            lineHeight: '1.3',
            fontFamily: "'EmOne', sans-serif"
          }}>
            <li>Create and connect nodes in your knowledge graph</li>
            <li>Explore semantic relationships between concepts</li>
            <li><strong>Decompose</strong> complex concepts into smaller parts</li>
            <li><strong>Generalize</strong> specific instances into broader categories</li>
            <li>Import data from external semantic web sources</li>
            <li>Build rich, interconnected knowledge structures</li>
          </ul>
        </div>

        <div style={{
          backgroundColor: 'rgba(139, 0, 0, 0.05)',
          border: '1px solid rgba(139, 0, 0, 0.2)',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '12px'
        }}>
          <h4 style={{
            margin: '0 0 8px 0',
            color: '#8B0000',
            fontSize: '1rem',
            fontWeight: 'bold',
            fontFamily: "'EmOne', sans-serif"
          }}>
            Limitations
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '16px',
            fontSize: '0.85rem',
            color: '#333',
            lineHeight: '1.3',
            fontFamily: "'EmOne', sans-serif"
          }}>
            <li><strong>Mobile:</strong> Not functional yet</li>
            <li><strong>Performance:</strong> Some features may be slower during alpha</li>
            <li><strong>Data:</strong> Your work is saved, but backup frequently</li>
            <li><strong>The Wizard: Is still sleeping</strong></li>
            <li><strong>Git: Partially implemented</strong></li>
            <li><strong>External Sources:</strong> Some endpoints may have CORS restrictions</li>
          </ul>
        </div>
      </div>

      {/* Action Button */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '0px',
        marginBottom: '12px'
      }}>
        <button
          onClick={handleClose}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#8B0000',
            color: '#bdb5b5',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            fontFamily: "'EmOne', sans-serif"
          }}
        >
          Make My First Universe
        </button>
      </div>
    </div>
  );

  return (
    <CanvasModal
      isVisible={isVisible}
      onClose={handleClose}
      title=""
      width={520}
      height={720}
      position="center"
      margin={20}
      {...canvasModalProps}
    >
      {modalContent}
    </CanvasModal>
  );
};

export default AlphaOnboardingModal;
