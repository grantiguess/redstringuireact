import React from 'react';
import { Github, ExternalLink, RefreshCw, Trash2, Link as LinkIcon, EyeOff, Eye, Star } from 'lucide-react';
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
    case 'disabled':
      return { ...base, opacity: 0.5, cursor: 'not-allowed' };
    default:
      return base;
  }
}

/**
 * RepositoriesSection - Shows your managed repositories
 * Add repos from GitHub that you want to use with Redstring
 */
const RepositoriesSection = ({
  repositories = [],
  onBrowseRepositories,
  onRemoveRepository,
  onToggleDisabled,
  onSetMainRepository,
  onLinkToUniverse,
  onRefresh,
  isRefreshing = false
}) => {
  if (repositories.length === 0) {
    return (
      <SectionCard 
        title="Repositories" 
        subtitle="Your curated list of repositories"
        actions={
          <button onClick={onBrowseRepositories} style={buttonStyle('solid')}>
            <Github size={14} /> Add Repositories
          </button>
        }
      >
        <div
          style={{
            padding: 12,
            border: '1px dashed #979090',
            borderRadius: 6,
            backgroundColor: '#bdb5b5',
            color: '#555',
            fontSize: '0.8rem'
          }}
        >
          No repositories in your list. Click "Add Repositories" to browse your GitHub repos and add them here.
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard 
      title="Repositories" 
      subtitle={`${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'} in your list`}
      actions={
        <button onClick={onBrowseRepositories} style={buttonStyle('solid')}>
          <Github size={14} /> Add More
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {repositories.map((repo) => {
          const repoFullName = `${repo.owner?.login || repo.owner}/${repo.name}`;

          return (
            <div
              key={repo.id || repoFullName}
              style={{
                border: `1px solid ${repo.disabled ? '#ccc' : '#260000'}`,
                borderRadius: 8,
                padding: 12,
                backgroundColor: repo.disabled ? '#e8e8e8' : '#bdb5b5',
                opacity: repo.disabled ? 0.6 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              {/* Repository header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Github size={18} />
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {repoFullName}
                      {repo.isMain && (
                        <Star size={14} style={{ color: '#ffa726', fill: '#ffa726' }} title="Main repository" />
                      )}
                    </div>
                    {repo.description && (
                      <div style={{ fontSize: '0.72rem', color: '#555' }}>{repo.description}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {repo.html_url && (
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        ...buttonStyle('outline'),
                        textDecoration: 'none'
                      }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>

              {/* Action buttons row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {onSetMainRepository && (
                  <button
                    onClick={() => onSetMainRepository(repo)}
                    style={{
                      ...buttonStyle('outline'),
                      color: repo.isMain ? '#ffa726' : '#666',
                      borderColor: repo.isMain ? '#ffa726' : '#666',
                      fontSize: '0.7rem',
                      padding: '4px 8px'
                    }}
                    title={repo.isMain ? 'Already main repository' : 'Set as main repository'}
                    disabled={repo.isMain}
                  >
                    <Star size={12} style={{ fill: repo.isMain ? '#ffa726' : 'none' }} />
                    Main
                  </button>
                )}

                {onToggleDisabled && (
                  <button
                    onClick={() => onToggleDisabled(repo)}
                    style={{
                      ...buttonStyle('outline'),
                      color: repo.disabled ? '#ef6c00' : '#666',
                      borderColor: repo.disabled ? '#ef6c00' : '#666',
                      fontSize: '0.7rem',
                      padding: '4px 8px'
                    }}
                    title={repo.disabled ? 'Enable repository' : 'Disable repository'}
                  >
                    {repo.disabled ? <Eye size={12} /> : <EyeOff size={12} />}
                    {repo.disabled ? 'Enable' : 'Disable'}
                  </button>
                )}

                {onRemoveRepository && (
                  <button
                    onClick={() => onRemoveRepository(repo)}
                    style={{
                      ...buttonStyle('outline'),
                      color: '#d32f2f',
                      borderColor: '#d32f2f',
                      fontSize: '0.7rem',
                      padding: '4px 8px'
                    }}
                    title="Remove from list"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default RepositoriesSection;
