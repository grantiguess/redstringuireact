import React from 'react';
import { Github, ExternalLink, RefreshCw } from 'lucide-react';
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
 * RepositoriesSection - Shows Redstring-affiliated repositories
 * These are repos specifically set up for Redstring data storage
 */
const RepositoriesSection = ({
  repositories = [],
  onBrowseRepositories,
  onRefresh,
  isRefreshing = false
}) => {
  // Filter for Redstring-specific repos (those with .redstring marker or known pattern)
  const redstringRepos = repositories.filter(repo => 
    repo.isRedstringRepo || repo.hasRedstringData
  );

  if (redstringRepos.length === 0) {
    return (
      <SectionCard 
        title="Repositories" 
        subtitle="Redstring-affiliated repositories"
        actions={
          <button onClick={onBrowseRepositories} style={buttonStyle('solid')}>
            <Github size={14} /> Browse Repositories
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
          No Redstring repositories found. Browse your GitHub repositories to discover or create Redstring data stores.
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard 
      title="Repositories" 
      subtitle={`${redstringRepos.length} Redstring ${redstringRepos.length === 1 ? 'repository' : 'repositories'}`}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <button 
            onClick={onRefresh} 
            style={buttonStyle(isRefreshing ? 'disabled' : 'outline')}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} /> {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={onBrowseRepositories} style={buttonStyle('solid')}>
            <Github size={14} /> Browse
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {redstringRepos.map((repo) => {
          const universes = repo.universes || [];
          const repoFullName = `${repo.owner}/${repo.name}`;

          return (
            <div
              key={repo.id || repoFullName}
              style={{
                border: '1px solid #260000',
                borderRadius: 8,
                padding: 12,
                backgroundColor: '#bdb5b5',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              {/* Repo Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Github size={18} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{repoFullName}</div>
                    {repo.description && (
                      <div style={{ fontSize: '0.72rem', color: '#555' }}>{repo.description}</div>
                    )}
                  </div>
                </div>
                {repo.htmlUrl && (
                  <a
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...buttonStyle('outline'),
                      textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={14} /> View
                  </a>
                )}
              </div>

              {/* Universes in this repo */}
              {universes.length > 0 ? (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000', marginBottom: 6 }}>
                    Universes in this repository ({universes.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {universes.map((universe) => (
                      <div
                        key={universe.slug || universe.path}
                        style={{
                          padding: 8,
                          backgroundColor: '#cfc6c6',
                          borderRadius: 6,
                          border: '1px solid #979090',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            {universe.name || universe.slug || 'Unnamed'}
                          </div>
                          {universe.path && (
                            <div style={{ fontSize: '0.68rem', color: '#555' }}>
                              {universe.path}
                            </div>
                          )}
                        </div>
                        {universe.isLinked && (
                          <span style={{ fontSize: '0.7rem', color: '#2e7d32', fontWeight: 600 }}>
                            Linked
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: '#555', fontStyle: 'italic' }}>
                  No universes discovered yet
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default RepositoriesSection;
