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
  onOpenLocal = null,
  onConnectGitHub = null,
  ...canvasModalProps
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [selectedOption, setSelectedOption] = useState('github'); // Default to GitHub as recommended
  const [currentStep, setCurrentStep] = useState('selection'); // 'selection', 'github-onboarding', 'github-connecting'

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

  // Render different content based on current step
  const renderStepContent = () => {
    if (currentStep === 'github-onboarding') {
      return renderGitHubOnboarding();
    } else if (currentStep === 'github-connecting') {
      return renderGitHubConnecting();
    }
    return renderSelection();
  };

  const renderSelection = () => (
    <>
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
              • Click the <strong>Globe icon</strong> in the left panel to start
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
            
            {/* Local File Buttons */}
            {selectedOption === 'local' && (
              <div style={{ 
                marginLeft: '32px', 
                marginTop: '12px', 
                display: 'flex', 
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={() => {
                    if (onCreateLocal) onCreateLocal();
                    handleClose();
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    backgroundColor: '#8B0000',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Create New
                </button>
                <button
                  onClick={() => {
                    if (onOpenLocal) onOpenLocal();
                    handleClose();
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    backgroundColor: '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Load Existing
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Button - Only show for GitHub option (Local has inline buttons) */}
      {selectedOption === 'github' && (
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
              // Start GitHub onboarding flow
              setCurrentStep('github-onboarding');
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
            Set Up GitHub Sync
          </button>
        </div>
      )}
    </>
  );

  const renderGitHubOnboarding = () => (
    <>
      {/* Back button in top left */}
      <button
        onClick={() => setCurrentStep('selection')}
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
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
        ← Back
      </button>

      {/* GitHub Onboarding Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px', flexShrink: 0, marginTop: '40px' }}>
        <h2 style={{
          margin: '0 0 8px 0',
          color: '#260000',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          fontFamily: "'EmOne', sans-serif"
        }}>
          Connect to GitHub
        </h2>
        <div style={{
          margin: '0 0 16px 0',
          fontSize: '0.9rem',
          color: '#666',
          fontFamily: "'EmOne', sans-serif"
        }}>
          Set up automatic cloud sync for your universes
        </div>
      </div>

      {/* GitHub Setup Steps */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Step 1: OAuth */}
        <div style={{
          border: '2px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f9f9f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#8B0000',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px',
              fontSize: '0.8rem',
              fontWeight: 'bold'
            }}>1</div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#260000' }}>Repository Access (OAuth)</h3>
          </div>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#666' }}>
            Connect your GitHub account to browse and create repositories
          </p>
          <button
            onClick={() => {
              setCurrentStep('github-connecting');
              if (onConnectGitHub) onConnectGitHub('oauth');
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#24292f',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            Connect OAuth
          </button>
        </div>

        {/* Step 2: GitHub App */}
        <div style={{
          border: '2px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f9f9f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#8B0000',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px',
              fontSize: '0.8rem',
              fontWeight: 'bold'
            }}>2</div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#260000' }}>Auto-Sync (GitHub App)</h3>
          </div>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#666' }}>
            Install the RedString app for automatic universe synchronization
          </p>
          <button
            onClick={() => {
              setCurrentStep('github-connecting');
              if (onConnectGitHub) onConnectGitHub('app');
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#8B0000',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            Install App
          </button>
        </div>

        {/* Complete Setup */}
        <div style={{
          textAlign: 'center',
          padding: '20px',
          backgroundColor: 'rgba(139, 0, 0, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(139, 0, 0, 0.2)'
        }}>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#666' }}>
            Complete both steps for full GitHub integration
          </p>
          <button
            onClick={() => {
              setCurrentStep('github-connecting');
              if (onConnectGitHub) onConnectGitHub('complete');
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#8B0000',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            Complete GitHub Setup
          </button>
        </div>
      </div>
    </>
  );

  const renderGitHubConnecting = () => (
    <>
      {/* Connecting Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px', flexShrink: 0, marginTop: '60px' }}>
        <h2 style={{
          margin: '0 0 16px 0',
          color: '#260000',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          fontFamily: "'EmOne', sans-serif"
        }}>
          Connecting to GitHub...
        </h2>
        
        {/* Loading Spinner */}
        <div style={{
          width: '40px',
          height: '40px',
          margin: '0 auto 20px auto',
          border: '4px solid #ddd',
          borderTop: '4px solid #8B0000',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        
        <p style={{
          margin: '0',
          fontSize: '0.9rem',
          color: '#666',
          fontFamily: "'EmOne', sans-serif"
        }}>
          You'll be redirected to GitHub to complete the setup...
        </p>
      </div>
      
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );

  const modalContent = (
    <div style={{
      padding: '24px',
      boxSizing: 'border-box',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {renderStepContent()}
    </div>
  );

  return (
    <CanvasModal
      isVisible={isVisible}
      onClose={handleClose}
      title=""
      width={600}
      height={700}
      position="center"
      margin={20}
      disableBackdrop={currentStep !== 'selection'} // Disable backdrop close during onboarding
      fullScreenOverlay={currentStep !== 'selection'} // Use full screen overlay for GitHub onboarding
      {...canvasModalProps}
    >
      {modalContent}
    </CanvasModal>
  );
};

export default AlphaOnboardingModal;
