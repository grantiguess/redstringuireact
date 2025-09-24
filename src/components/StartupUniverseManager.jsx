/**
 * Startup Universe Manager - Critical component for mobile/tablet users
 *
 * This component provides immediate access to universe management on app startup,
 * especially important for mobile devices that rely entirely on Git-based storage.
 * Can be triggered automatically or by user action during the startup process.
 */

import React, { useState, useEffect } from 'react';
import UniverseManagerModal, { useUniverseModal } from './UniverseManagerModal.jsx';

const StartupUniverseManager = ({
  autoShowOnMobileStart = true,
  showTriggerButton = true,
  priority = true
}) => {
  const { isOpen, openModal, closeModal, UniverseModal } = useUniverseModal();
  const [hasShownAutoModal, setHasShownAutoModal] = useState(false);

  // Device detection
  const deviceInfo = React.useMemo(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
    const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/i.test(navigator.userAgent.toLowerCase()) ||
                     (/macintosh/i.test(navigator.userAgent.toLowerCase()) && isTouch);
    const gitOnlyMode = isMobile || isTablet || !('showSaveFilePicker' in window);

    return { isMobile, isTablet, isTouch, gitOnlyMode };
  }, []);

  // Auto-show modal on mobile startup (one time per session)
  useEffect(() => {
    if (autoShowOnMobileStart &&
        deviceInfo.gitOnlyMode &&
        !hasShownAutoModal &&
        !sessionStorage.getItem('startup_universe_modal_shown')) {

      console.log('[StartupUniverseManager] Auto-showing universe manager for mobile device');

      // Small delay to let other components initialize
      setTimeout(() => {
        openModal();
        setHasShownAutoModal(true);
        sessionStorage.setItem('startup_universe_modal_shown', 'true');
      }, 2000);
    }
  }, [autoShowOnMobileStart, deviceInfo.gitOnlyMode, hasShownAutoModal, openModal]);

  const handleModalClose = () => {
    closeModal();
    // Don't auto-show again this session
    sessionStorage.setItem('startup_universe_modal_shown', 'true');
  };

  return (
    <>
      {/* Trigger Button (optional) */}
      {showTriggerButton && (
        <button
          onClick={openModal}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '10px 15px',
            backgroundColor: '#7A0000',
            color: '#bdb5b5',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: priority ? 9999 : 999,
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            display: deviceInfo.gitOnlyMode ? 'block' : 'none'
          }}
          title="Manage Universes - Essential for mobile/tablet users"
        >
          {deviceInfo.isMobile ? '🌌' : 'Universes'}
        </button>
      )}

      {/* Modal */}
      <UniverseModal
        priority={priority}
        canCloseByBackdrop={!deviceInfo.gitOnlyMode} // Make it harder to accidentally close on mobile
        onClose={handleModalClose}
      />
    </>
  );
};

export default StartupUniverseManager;