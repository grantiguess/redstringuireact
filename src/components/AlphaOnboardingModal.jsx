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
  onCreateLocal = null,
  onConnectGitHub = null,
  ...canvasModalProps
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [selectedOption, setSelectedOption] = useState('github'); // Default to GitHub as recommended

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
          fontFamily: "'EmOne', sans-serif",
          textAlign: 'center'
        }}>
          <strong>Redstring</strong> is an open knowledge graph platform that lets you build, connect, and explore
          ideas through semantic relationships.
        </p>

        <h4 style={{
          margin: '0 0 16px 0',
          color: '#8B0000',
          fontSize: '1rem',
          fontWeight: 'bold',
          fontFamily: "'EmOne', sans-serif",
          textAlign: 'center'
        }}>
          Choose how to store your universes:
        </h4>

        {/* Storage Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          
          {/* GitHub Option (Recommended) */}
          <div 
            onClick={() => setSelectedOption('github')}
            style={{
              border: `2px solid ${selectedOption === 'github' ? '#8B0000' : '#ddd'}`,
              borderRadius: '8px',
              padding: '16px',
              cursor: 'pointer',
              backgroundColor: selectedOption === 'github' ? 'rgba(139, 0, 0, 0.05)' : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: `2px solid ${selectedOption === 'github' ? '#8B0000' : '#ddd'}`,
                backgroundColor: selectedOption === 'github' ? '#8B0000' : 'transparent',
                marginRight: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {selectedOption === 'github' && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />
                )}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#260000' }}>
                GitHub Sync <span style={{ color: '#8B0000', fontSize: '0.8rem' }}>(Recommended)</span>
              </div>
            </div>
            <div style={{ marginLeft: '32px', fontSize: '0.85rem', color: '#666' }}>
              • <strong>GitHub App</strong>: Secure, persistent connections<br />
              • <strong>OAuth</strong>: Repository browsing and creation<br />
              • Automatic cloud backup and version history<br />
              • Access your universes from anywhere
            </div>
          </div>

          {/* Local File Option */}
          <div 
            onClick={() => setSelectedOption('local')}
            style={{
              border: `2px solid ${selectedOption === 'local' ? '#8B0000' : '#ddd'}`,
              borderRadius: '8px',
              padding: '16px',
              cursor: 'pointer',
              backgroundColor: selectedOption === 'local' ? 'rgba(139, 0, 0, 0.05)' : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: `2px solid ${selectedOption === 'local' ? '#8B0000' : '#ddd'}`,
                backgroundColor: selectedOption === 'local' ? '#8B0000' : 'transparent',
                marginRight: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {selectedOption === 'local' && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />
                )}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#260000' }}>
                Local Files
              </div>
            </div>
            <div style={{ marginLeft: '32px', fontSize: '0.85rem', color: '#666' }}>
              • Store universe files on your device<br />
              • Full control over your data<br />
              • Works without internet connection<br />
              • Manual backup and file management
            </div>
          </div>
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
          onClick={() => {
            if (selectedOption === 'github' && onConnectGitHub) {
              onConnectGitHub();
            } else if (selectedOption === 'local' && onCreateLocal) {
              onCreateLocal();
            }
            handleClose();
          }}
          style={{
            padding: '12px 32px',
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
          {selectedOption === 'github' ? 'Connect to GitHub' : 'Create Local Universe'}
        </button>
      </div>
    </div>
  );

  return (
    <CanvasModal
      isVisible={isVisible}
      onClose={handleClose}
      title=""
      width={560}
      height={600}
      position="center"
      margin={20}
      {...canvasModalProps}
    >
      {modalContent}
    </CanvasModal>
  );
};

export default AlphaOnboardingModal;
