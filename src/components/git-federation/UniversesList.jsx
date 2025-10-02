import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, Github, Upload, Download, X, Edit, Star, Save, Activity } from 'lucide-react';
import SectionCard from './shared/SectionCard.jsx';

function buttonStyle(variant = 'outline') {
  const base = {
    border: '1px solid #260000',
    backgroundColor: 'transparent',
    color: '#260000',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s'
  };

  switch (variant) {
    case 'solid':
      return { ...base, backgroundColor: '#260000', color: '#fefefe' };
    case 'danger':
      return { ...base, borderColor: '#c62828', color: '#c62828' };
    case 'disabled':
      return { ...base, opacity: 0.5, cursor: 'not-allowed' };
    default:
      return base;
  }
}

function formatWhen(timestamp) {
  if (!timestamp) return 'Never';
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

const UniversesList = ({
  universes = [],
  activeUniverseSlug,
  syncStatusMap = {},
  onCreateUniverse,
  onSwitchUniverse,
  onDeleteUniverse,
  onLinkRepo,
  onLinkLocalFile,
  onDownloadLocalFile,
  onRemoveRepoSource,
  onEditRepoSource,
  onSetMainRepoSource,
  onSaveRepoSource,
  isSlim = false
}) => {
  // Track which universes are expanded
  const [expandedUniverses, setExpandedUniverses] = useState(new Set([activeUniverseSlug]));

  const toggleExpand = (slug) => {
    setExpandedUniverses((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  return (
    <SectionCard
      title="Universes"
      subtitle="Manage your knowledge spaces"
      actions={
        <button onClick={onCreateUniverse} style={buttonStyle('solid')}>
          <Plus size={14} /> New
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {universes.map((universe) => {
          const isActive = universe.slug === activeUniverseSlug;
          const isExpanded = expandedUniverses.has(universe.slug);
          const sources = (universe.raw?.sources || []).filter((src) => src.type === 'github');

          return (
            <div
              key={universe.slug}
              style={{
                border: isActive ? '2px solid #7A0000' : '1px solid #260000',
                borderRadius: 8,
                backgroundColor: '#bdb5b5',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => toggleExpand(universe.slug)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 0,
                    flex: 1,
                    outline: 'none'
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <ChevronDown 
                    size={16} 
                    style={{ 
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.2s ease',
                      color: '#260000'
                    }} 
                  />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: '#260000' }}>{universe.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#555' }}>
                      Created {formatWhen(universe.createdAt)} · Updated {formatWhen(universe.updatedAt)}
                    </div>
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!isActive && (
                    <button onClick={() => onSwitchUniverse(universe.slug)} style={buttonStyle('outline')}>
                      Switch
                    </button>
                  )}
                  {universes.length > 1 && (
                    <button
                      onClick={() => onDeleteUniverse(universe.slug, universe.name)}
                      style={buttonStyle('danger')}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 24 }}>
                  {/* Storage Info */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000', marginBottom: 6 }}>
                      Storage
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: 8 }}>
                      Primary: {universe.storage?.primary?.label || 'Browser cache'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => onLinkRepo && onLinkRepo(universe.slug)} style={buttonStyle('solid')}>
                        <Github size={14} /> Link Repo
                      </button>
                      <button onClick={() => onLinkLocalFile && onLinkLocalFile(universe.slug)} style={buttonStyle('outline')}>
                        <Upload size={14} /> Import File
                      </button>
                      <button onClick={() => onDownloadLocalFile && onDownloadLocalFile(universe.slug)} style={buttonStyle('outline')}>
                        <Download size={14} /> Download
                      </button>
                    </div>
                  </div>

                  {/* Sources */}
                  {sources.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000', marginBottom: 6 }}>
                        Repository Sources ({sources.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sources.map((source, index) => {
                          const isMainSource = index === 0; // First source is considered main for now
                          const syncStatus = syncStatusMap[universe.slug];
                          const isActive = syncStatus?.isRunning || false;
                          const hasErrors = syncStatus?.consecutiveErrors > 0;

                          return (
                            <div
                              key={source.id}
                              style={{
                                padding: 8,
                                backgroundColor: '#cfc6c6',
                                borderRadius: 6,
                                border: `1px solid ${hasErrors ? '#d32f2f' : isActive ? '#2e7d32' : '#979090'}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6
                              }}
                            >
                              {/* Source header */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Github size={14} />
                                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                    @{source.user}/{source.repo}
                                  </span>
                                  {isMainSource && (
                                    <Star size={12} style={{ color: '#ffa726', fill: '#ffa726' }} title="Main repository source" />
                                  )}
                                  <div style={{
                                    fontSize: '0.6rem',
                                    padding: '2px 4px',
                                    borderRadius: 3,
                                    backgroundColor: hasErrors ? '#ffebee' : isActive ? '#e8f5e8' : '#f5f5f5',
                                    color: hasErrors ? '#d32f2f' : isActive ? '#2e7d32' : '#666',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2
                                  }}>
                                    <Activity size={8} />
                                    {hasErrors ? 'Error' : isActive ? 'Syncing' : 'Idle'}
                                  </div>
                                </div>

                                <button
                                  onClick={() => onRemoveRepoSource && onRemoveRepoSource(universe.slug, source)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#d32f2f',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    opacity: 0.7,
                                    transition: 'opacity 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.target.style.opacity = '1'}
                                  onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                                  title="Remove source"
                                >
                                  <X size={12} />
                                </button>
                              </div>

                              {/* Action buttons row */}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {!isMainSource && onSetMainRepoSource && (
                                  <button
                                    onClick={() => onSetMainRepoSource(universe.slug, source)}
                                    style={{
                                      ...buttonStyle('outline'),
                                      fontSize: '0.65rem',
                                      padding: '2px 6px'
                                    }}
                                    title="Set as main source"
                                  >
                                    <Star size={10} />
                                    Main
                                  </button>
                                )}

                                {onEditRepoSource && (
                                  <button
                                    onClick={() => onEditRepoSource(universe.slug, source)}
                                    style={{
                                      ...buttonStyle('outline'),
                                      fontSize: '0.65rem',
                                      padding: '2px 6px'
                                    }}
                                    title="Edit source"
                                  >
                                    <Edit size={10} />
                                    Edit
                                  </button>
                                )}

                                {onSaveRepoSource && (
                                  <button
                                    onClick={() => onSaveRepoSource(universe.slug, source)}
                                    style={{
                                      ...buttonStyle('outline'),
                                      fontSize: '0.65rem',
                                      padding: '2px 6px',
                                      color: '#2e7d32',
                                      borderColor: '#2e7d32'
                                    }}
                                    title="Manual save"
                                    disabled={isActive}
                                  >
                                    <Save size={10} />
                                    Save
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default UniversesList;
