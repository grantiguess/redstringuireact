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
    <div>
      {/* Welcome Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          fontSize: '2.5rem',
          marginBottom: '8px',
          color: '#8B0000'
        }}>
          🎯
        </div>
        <h2 style={{
          margin: '0 0 8px 0',
          color: '#260000',
          fontSize: '1.8rem',
          fontWeight: 'bold'
        }}>
          Welcome to Redstring
        </h2>
        <div style={{
          fontSize: '1.1rem',
          color: '#666',
          fontStyle: 'italic'
        }}>
          Open Alpha - Your feedback shapes the future
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginBottom: '24px', lineHeight: '1.6' }}>
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '1rem',
          color: '#333'
        }}>
          <strong>Redstring</strong> is a knowledge graph platform that lets you build, connect, and explore
          ideas through semantic relationships. We're currently in <strong>open alpha</strong>, which means
          you're among the first to experience this new way of organizing information.
        </p>

        <div style={{
          backgroundColor: 'rgba(139, 0, 0, 0.05)',
          border: '1px solid rgba(139, 0, 0, 0.2)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            color: '#8B0000',
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            🚀 What You Can Do
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '20px',
            fontSize: '0.9rem',
            color: '#333'
          }}>
            <li>Create and connect nodes in your knowledge graph</li>
            <li>Explore semantic relationships between concepts</li>
            <li>Import data from external semantic web sources</li>
            <li>Build rich, interconnected knowledge structures</li>
          </ul>
        </div>

        <div style={{
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            color: '#856404',
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            ⚠️ Current Limitations
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '20px',
            fontSize: '0.9rem',
            color: '#856404'
          }}>
            <li><strong>Mobile Experience:</strong> We're still optimizing for mobile devices</li>
            <li><strong>Performance:</strong> Some features may be slower during alpha</li>
            <li><strong>Data Persistence:</strong> Your work is saved, but backup frequently</li>
            <li><strong>External Sources:</strong> Some semantic web endpoints may have CORS restrictions</li>
          </ul>
        </div>

        <p style={{
          margin: '0 0 16px 0',
          fontSize: '0.95rem',
          color: '#666',
          fontStyle: 'italic'
        }}>
          Your feedback is invaluable during this alpha phase. Every issue you report,
          every suggestion you make, helps us build a better Redstring for everyone.
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          color: '#666'
        }}>
          <input
            type="checkbox"
            id="dont-show-again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{
              cursor: 'pointer'
            }}
          />
          <label
            htmlFor="dont-show-again"
            style={{
              cursor: 'pointer',
              margin: 0
            }}
          >
            Don't show this again
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#666',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            {dontShowAgain ? 'Got it!' : 'Maybe Later'}
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#8B0000',
              color: '#bdb5b5',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            Start Exploring
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: '1px solid rgba(38, 0, 0, 0.1)',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#888'
      }}>
        <div style={{ marginBottom: '4px' }}>
          Found an issue or have feedback?
        </div>
        <div style={{ fontStyle: 'italic' }}>
          Use the tools menu or contact us directly
        </div>
      </div>
    </div>
  );

  return (
    <CanvasModal
      isVisible={isVisible}
      onClose={handleClose}
      title=""
      width={500}
      position="center"
      margin={24}
      {...canvasModalProps}
    >
      {modalContent}
    </CanvasModal>
  );
};

export default AlphaOnboardingModal;
