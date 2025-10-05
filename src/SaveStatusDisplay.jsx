import React, { useState, useEffect } from 'react';
import { HEADER_HEIGHT } from './constants';
import saveCoordinator from './services/SaveCoordinator';

const SaveStatusDisplay = () => {
  const [statusText, setStatusText] = useState('Saved');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = saveCoordinator.onStatusChange((status) => {
      if (status.type === 'success') {
        setStatusText('Saved');
        setIsSaving(false);
      } else if (status.type === 'error') {
        setStatusText('Error');
        setIsSaving(false);
      } else if (status.type === 'info' && status.message.includes('saving')) {
        setStatusText('Saving...');
        setIsSaving(true);
      }
    });

    // Poll status every second to update display
    const pollInterval = setInterval(() => {
      const status = saveCoordinator.getStatus();
      
      if (!status.isEnabled) {
        setStatusText('Autosave disabled');
        setIsSaving(false);
        return;
      }
      
      if (status.isSaving) {
        setStatusText('Saving...');
        setIsSaving(true);
      } else if (status.pendingChanges > 0) {
        setStatusText(`${status.pendingChanges} pending`);
        setIsSaving(false);
      } else if (!status.isSaving && status.pendingChanges === 0) {
        // Check if git autosave policy has information
        const gitPolicy = status.gitAutosavePolicy;
        if (gitPolicy && gitPolicy.lastCommitTime) {
          const secondsAgo = Math.floor((Date.now() - gitPolicy.lastCommitTime) / 1000);
          if (secondsAgo < 10) {
            setStatusText('Synced');
          } else if (secondsAgo < 60) {
            setStatusText(`${secondsAgo}s ago`);
          } else {
            setStatusText('Saved');
          }
        } else {
          setStatusText('Saved');
        }
        setIsSaving(false);
      }
    }, 1000);

    // Initial status check
    const status = saveCoordinator.getStatus();
    if (status.isSaving) {
      setStatusText('Saving...');
      setIsSaving(true);
    } else if (status.pendingChanges > 0) {
      setStatusText(`${status.pendingChanges} pending`);
      setIsSaving(false);
    }

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <div
      className="save-status-display"
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        margin: '0 10px 10px 0',
        height: `${HEADER_HEIGHT}px`,
        width: `${HEADER_HEIGHT * 3}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#260000',
        border: '2px solid #260000',
        borderRadius: '8px',
        padding: 0,
        color: '#bdb5b5',
        zIndex: 20000,
        boxShadow: '0 0 0 3px #BDB5B5, 0 2px 5px rgba(0, 0, 0, 0.2)',
        fontSize: '16px',
        fontFamily: "'EmOne', sans-serif",
        fontWeight: 'normal',
        userSelect: 'none'
      }}
    >
      {statusText}
    </div>
  );
};

export default SaveStatusDisplay;

