const { useState, useEffect, useCallback, useRef } = React;

// --- Helper Functions ---
function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

// Main React App Component
function App() {
  const [matches, setMatches] = useState([]);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [tickerMessage, setTickerMessage] = useState('Connecting to Sportz Real-Time Engine...');
  
  const [selectedSport, setSelectedSport] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [commentaryList, setCommentaryList] = useState([]);
  const [activeTab, setActiveTab] = useState('tabCommentary');
  const [activeEventFilter, setActiveEventFilter] = useState('all');
  const [eventCount, setEventCount] = useState(0);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const socketRef = useRef(null);
  const subscribedMatchIdRef = useRef(null);

  // Trigger Feather Icons replacement
  useEffect(() => {
    if (window.feather) {
      window.feather.replace();
    }
  });

  // Fetch all matches from REST API
  const fetchMatches = useCallback(async () => {
    try {
      const res = await fetch('/matches?limit=100');
      if (!res.ok) throw new Error('Failed to fetch matches');
      const json = await res.json();
      setMatches(json.data || []);
    } catch (err) {
      console.error('Error fetching matches:', err);
    }
  }, []);

  // Fetch commentary for selected match
  const fetchCommentary = useCallback(async (matchId) => {
    try {
      const res = await fetch(`/matches/${matchId}/commentary?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch commentary');
      const json = await res.json();
      setCommentaryList(json.data || []);
    } catch (err) {
      console.error('Error fetching commentary:', err);
      setCommentaryList([]);
    }
  }, []);

  // WebSocket Channel Subscriptions
  const subscribeToMatchWS = useCallback((matchId) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      subscribedMatchIdRef.current = matchId;
      return;
    }
    
    if (subscribedMatchIdRef.current && subscribedMatchIdRef.current !== matchId) {
      socketRef.current.send(JSON.stringify({ type: 'unsubscribe', matchId: subscribedMatchIdRef.current }));
    }

    subscribedMatchIdRef.current = matchId;
    socketRef.current.send(JSON.stringify({ type: 'subscribe', matchId: matchId }));
  }, []);

  const unsubscribeFromMatchWS = useCallback((matchId) => {
    subscribedMatchIdRef.current = null;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (matchId) {
      socketRef.current.send(JSON.stringify({ type: 'unsubscribe', matchId: matchId }));
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    fetchMatches();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8080';
    const wsUrl = `${protocol}//${host}/ws`;

    let disposed = false;
    let reconnectTimer = null;

    function connect() {
      if (disposed) return;
      setWsStatus('connecting');
      setTickerMessage('Connecting to Sportz Real-Time Engine...');

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setWsStatus('connected');
        setTickerMessage('Connected to Sportz Real-Time Engine via WebSocket');

        if (subscribedMatchIdRef.current) {
          subscribeToMatchWS(subscribedMatchIdRef.current);
        }
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data);
          if (!msg || !msg.type) return;

          if (msg.type === 'Match Created' && msg.data) {
            setMatches(prev => {
              const idx = prev.findIndex(m => m.id === msg.data.id);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = msg.data;
                return updated;
              }
              return [msg.data, ...prev];
            });
            setTickerMessage(`NEW MATCH CREATED: ${msg.data.homeTeam} vs ${msg.data.awayTeam} (${msg.data.sport})`);
          } else if (msg.type === 'commentary' && msg.data) {
            setEventCount(prev => prev + 1);
            if (subscribedMatchIdRef.current === msg.data.matchId) {
              setCommentaryList(prev => [msg.data, ...prev]);
              setTickerMessage(`LIVE EVENT (${msg.data.period}): ${msg.data.message}`);
            }
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setWsStatus('offline');
        setTickerMessage('WebSocket connection closed. Retrying in 5s...');
        reconnectTimer = setTimeout(connect, 5000);
      };

      socket.onerror = (err) => {
        if (disposed) return;
        console.error('WS Error:', err);
        socket.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socketRef.current = null;
      }
    };
  }, [fetchMatches, subscribeToMatchWS]);

  // Open Match Details Modal
  const handleOpenDetails = (matchObj) => {
    setSelectedMatch(matchObj);
    setActiveTab('tabCommentary');
    subscribeToMatchWS(matchObj.id);
    fetchCommentary(matchObj.id);
  };

  // Close Match Details Modal
  const handleCloseDetails = () => {
    if (selectedMatch) {
      unsubscribeFromMatchWS(selectedMatch.id);
      setSelectedMatch(null);
    }
  };

  // Create Match Handler
  const handleCreateMatchSubmit = async (formData) => {
    try {
      const res = await fetch('/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create match');
      }

      const json = await res.json();
      setIsCreateModalOpen(false);
      if (json.data) {
        handleOpenDetails(json.data);
      }
    } catch (err) {
      alert(`Match creation error: ${err.message}`);
    }
  };

  // Post Commentary Event Handler
  const handlePostCommentarySubmit = async (matchId, formData) => {
    try {
      const res = await fetch(`/matches/${matchId}/commentary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to post commentary');
      }

      setActiveTab('tabCommentary');
    } catch (err) {
      alert(`Commentary post error: ${err.message}`);
    }
  };

  // Filter Matches
  const filteredMatches = matches.filter(m => {
    if (selectedSport !== 'all' && m.sport.toLowerCase() !== selectedSport.toLowerCase()) return false;
    if (selectedStatus !== 'all' && m.status.toLowerCase() !== selectedStatus.toLowerCase()) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const homeMatch = m.homeTeam.toLowerCase().includes(q);
      const awayMatch = m.awayTeam.toLowerCase().includes(q);
      const sportMatch = m.sport.toLowerCase().includes(q);
      if (!homeMatch && !awayMatch && !sportMatch) return false;
    }
    return true;
  });

  const featuredMatch = matches.find(m => m.status === 'live') || matches[0];
  const liveMatchesCount = matches.filter(m => m.status === 'live').length;

  return (
    <React.Fragment>
      {/* Top Status Bar */}
      <div className="top-status-bar">
        <div className="status-bar-content">
          <span className="ticker-label"><i data-feather="radio"></i> LIVE SIGNAL:</span>
          <span className="ticker-text">{tickerMessage}</span>
        </div>
        <div className="status-bar-right">
          <div className={`ws-badge ${wsStatus}`}>
            <span className="pulse-dot"></span>
            <span>{wsStatus === 'connected' ? 'LIVE WS' : wsStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <header className="navbar">
        <div className="nav-container">
          <div className="brand">
            <div className="logo-icon"><i data-feather="activity"></i></div>
            <div className="brand-text">
              <h1>SPORTZ<span className="accent-dot">.</span></h1>
              <span className="sub-logo">CYBER LIVE ENGINE</span>
            </div>
          </div>

          <nav className="sport-tabs">
            {['all', 'Cricket', 'Football', 'Basketball'].map(s => (
              <button 
                key={s} 
                className={`tab-btn ${selectedSport === s ? 'active' : ''}`}
                onClick={() => setSelectedSport(s)}
              >
                <i data-feather={s === 'all' ? 'grid' : s === 'Cricket' ? 'target' : s === 'Football' ? 'dribbble' : 'disc'}></i>
                {s === 'all' ? 'All Sports' : s}
              </button>
            ))}
          </nav>

          <div className="nav-actions">
            <button className="btn btn-secondary" onClick={fetchMatches}>
              <i data-feather="refresh-cw"></i> Sync
            </button>
            <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
              <i data-feather="plus-circle"></i> Create Match
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="app-container">
        {/* Featured Hero Showcase */}
        {featuredMatch && (
          <HeroShowcase match={featuredMatch} onSelect={() => handleOpenDetails(featuredMatch)} />
        )}

        {/* Toolbar */}
        <section className="toolbar-section">
          <div className="search-box">
            <i data-feather="search" className="search-icon"></i>
            <input 
              type="text" 
              placeholder="Search teams or sports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Status:</label>
            {[
              { id: 'all', label: 'All Matches' },
              { id: 'live', label: 'Live', dot: true },
              { id: 'scheduled', label: 'Upcoming' },
              { id: 'finished', label: 'Finished' }
            ].map(st => (
              <button
                key={st.id}
                className={`filter-chip ${selectedStatus === st.id ? 'active' : ''}`}
                onClick={() => setSelectedStatus(st.id)}
              >
                {st.dot && <span className="chip-dot live"></span>}
                {st.label}
              </button>
            ))}
          </div>
        </section>

        {/* Metrics Banner */}
        <section className="metrics-banner">
          <div className="metric-card">
            <div className="metric-icon cyan"><i data-feather="tv"></i></div>
            <div className="metric-info">
              <span className="metric-value">{matches.length}</span>
              <span className="metric-label">Total Matches</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon magenta"><i data-feather="zap"></i></div>
            <div className="metric-info">
              <span className="metric-value">{liveMatchesCount}</span>
              <span className="metric-label">Currently Live</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon gold"><i data-feather="message-square"></i></div>
            <div className="metric-info">
              <span className="metric-value">{eventCount}</span>
              <span className="metric-label">Live Events Streamed</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon emerald"><i data-feather="wifi"></i></div>
            <div className="metric-info">
              <span className="metric-value">Active</span>
              <span className="metric-label">WS Realtime Engine</span>
            </div>
          </div>
        </section>

        {/* Matches Grid */}
        <section className="matches-section">
          <div className="section-header">
            <h2><i data-feather="play-circle"></i> Live Scoreboards</h2>
            <span className="count-badge">{filteredMatches.length} matches</span>
          </div>

          <div className="match-grid">
            {filteredMatches.length === 0 ? (
              <div className="empty-state">
                <i data-feather="inbox"></i>
                <p>No matches found matching criteria.</p>
              </div>
            ) : (
              filteredMatches.map(m => (
                <MatchCard key={m.id} match={m} onClick={() => handleOpenDetails(m)} />
              ))
            )}
          </div>
        </section>
      </main>

      {/* Match Details Drawer Modal */}
      {selectedMatch && (
        <MatchDetailsModal 
          match={selectedMatch}
          commentaryList={commentaryList}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeEventFilter={activeEventFilter}
          setActiveEventFilter={setActiveEventFilter}
          onClose={handleCloseDetails}
          onPostCommentary={(formData) => handlePostCommentarySubmit(selectedMatch.id, formData)}
        />
      )}

      {/* Create Match Modal */}
      {isCreateModalOpen && (
        <CreateMatchModal 
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateMatchSubmit}
        />
      )}
    </React.Fragment>
  );
}

// Hero Featured Showcase Component
function HeroShowcase({ match, onSelect }) {
  const isLive = match.status === 'live';
  const homeInitial = match.homeTeam.substring(0, 1).toUpperCase();
  const awayInitial = match.awayTeam.substring(0, 1).toUpperCase();

  return (
    <div className="hero-showcase">
      <div className="hero-header">
        <span className="hero-label">
          <i data-feather="award"></i> FEATURED {match.sport.toUpperCase()} MATCH
        </span>
        <span className={`status-badge-sm ${match.status}`}>
          {isLive && <span className="chip-dot live"></span>} {match.status.toUpperCase()}
        </span>
      </div>

      <div className="hero-content">
        <div className="hero-team">
          <div className="hero-avatar">{homeInitial}</div>
          <span className="hero-team-name">{match.homeTeam}</span>
        </div>

        <div className="hero-score-board">
          <span className="hero-score-val">{match.homeScore ?? 0}</span>
          <span className="hero-vs">VS</span>
          <span className="hero-score-val">{match.awayScore ?? 0}</span>
        </div>

        <div className="hero-team">
          <span className="hero-team-name">{match.awayTeam}</span>
          <div className="hero-avatar">{awayInitial}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onSelect}>
          <i data-feather="radio"></i> Open Ball-by-Ball Live Stream
        </button>
      </div>
    </div>
  );
}

// Match Card Component
function MatchCard({ match, onClick }) {
  const isLive = match.status === 'live';
  const homeInitial = match.homeTeam.substring(0, 1).toUpperCase();
  const awayInitial = match.awayTeam.substring(0, 1).toUpperCase();

  return (
    <div className={`match-card ${isLive ? 'is-live' : ''}`} onClick={onClick}>
      <div className="card-top">
        <span className="sport-tag">{match.sport}</span>
        <span className={`status-badge-sm ${match.status}`}>
          {isLive && <span className="chip-dot live"></span>} {match.status.toUpperCase()}
        </span>
      </div>

      <div className="card-teams">
        <div className="team-row">
          <div className="team-info">
            <div className="team-badge-circle">{homeInitial}</div>
            <span className="team-name">{match.homeTeam}</span>
          </div>
          <span className="team-score">{match.homeScore ?? 0}</span>
        </div>

        <div className="team-row">
          <div className="team-info">
            <div className="team-badge-circle">{awayInitial}</div>
            <span className="team-name">{match.awayTeam}</span>
          </div>
          <span className="team-score">{match.awayScore ?? 0}</span>
        </div>
      </div>

      <div className="card-footer">
        <span>Started: {formatDate(match.startTime)}</span>
        <span className="action-link">View Live Feed <i data-feather="chevron-right"></i></span>
      </div>
    </div>
  );
}

// Match Details Modal Component
function MatchDetailsModal({ match, commentaryList, activeTab, setActiveTab, activeEventFilter, setActiveEventFilter, onClose, onPostCommentary }) {
  const isLive = match.status === 'live';
  const homeInitial = match.homeTeam.substring(0, 1).toUpperCase();
  const awayInitial = match.awayTeam.substring(0, 1).toUpperCase();

  const filteredCommentary = commentaryList.filter(item => {
    if (activeEventFilter === 'boundary') {
      return item.eventType === 'boundary_6' || item.eventType === 'boundary_4' || item.eventType === 'goal';
    }
    if (activeEventFilter === 'wicket') {
      return item.eventType === 'wicket' || item.eventType === 'card_yellow' || item.eventType === 'card_red';
    }
    return true;
  });

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-large">
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="sport-tag">{match.sport.toUpperCase()}</span>
            <h2>{match.homeTeam} vs {match.awayTeam}</h2>
            <span className={`status-badge-sm ${match.status}`}>{match.status.toUpperCase()}</span>
          </div>
          <button className="close-btn" onClick={onClose}><i data-feather="x"></i></button>
        </div>

        <div className="modal-body">
          {/* Scoreboard Hero */}
          <div className="scoreboard-hero">
            <div className="team-score-card home">
              <div className="team-avatar">{homeInitial}</div>
              <div className="team-meta">
                <h3>{match.homeTeam}</h3>
                <div className="score-display">{match.homeScore ?? 0}</div>
              </div>
            </div>

            <div className="versus-divider">
              <span className="vs-text">VS</span>
              {isLive && (
                <div className="live-pulse-container">
                  <span className="pulse-ring"></span>
                  <span className="live-text">LIVE STREAM</span>
                </div>
              )}
              <span className="match-time-info">Started: {formatDate(match.startTime)}</span>
            </div>

            <div className="team-score-card away">
              <div className="team-meta align-right">
                <h3>{match.awayTeam}</h3>
                <div className="score-display">{match.awayScore ?? 0}</div>
              </div>
              <div className="team-avatar">{awayInitial}</div>
            </div>
          </div>

          {/* Detail Tabs */}
          <div className="detail-tabs">
            <button 
              className={`detail-tab-btn ${activeTab === 'tabCommentary' ? 'active' : ''}`}
              onClick={() => setActiveTab('tabCommentary')}
            >
              <i data-feather="message-circle"></i> Real-Time Commentary Feed
            </button>
            <button 
              className={`detail-tab-btn ${activeTab === 'tabScorecard' ? 'active' : ''}`}
              onClick={() => setActiveTab('tabScorecard')}
            >
              <i data-feather="bar-chart-2"></i> Match Scorecard & Details
            </button>
            <button 
              className={`detail-tab-btn ${activeTab === 'tabAdmin' ? 'active' : ''}`}
              onClick={() => setActiveTab('tabAdmin')}
            >
              <i data-feather="edit-3"></i> Post Event (Simulator)
            </button>
          </div>

          {/* Tab 1: Live Commentary Feed */}
          {activeTab === 'tabCommentary' && (
            <div className="tab-content active">
              <div className="commentary-controls">
                <div className="event-filter-chips">
                  {['all', 'boundary', 'wicket'].map(f => (
                    <button
                      key={f}
                      className={`chip ${activeEventFilter === f ? 'active' : ''}`}
                      onClick={() => setActiveEventFilter(f)}
                    >
                      {f === 'all' ? 'All Events' : f === 'boundary' ? 'Boundaries / Goals' : 'Wickets / Cards'}
                    </button>
                  ))}
                </div>
                <div className="ws-live-status">
                  <span className="mini-pulse"></span> Subscribed to Match #{match.id}
                </div>
              </div>

              <div className="commentary-list">
                {filteredCommentary.length === 0 ? (
                  <div className="empty-state">
                    <i data-feather="message-square"></i>
                    <p>No commentary logged for this match yet. Use "Post Event" tab to stream live updates!</p>
                  </div>
                ) : (
                  filteredCommentary.map((c, i) => {
                    let eventClass = 'event-normal';
                    let tagLabel = c.eventType || 'commentary';
                    let tagClass = 'normal';

                    if (c.eventType === 'boundary_6') {
                      eventClass = 'event-6'; tagLabel = '6 RUNS!'; tagClass = 'six';
                    } else if (c.eventType === 'boundary_4') {
                      eventClass = 'event-4'; tagLabel = '4 RUNS!'; tagClass = 'four';
                    } else if (c.eventType === 'wicket') {
                      eventClass = 'event-wicket'; tagLabel = 'WICKET!'; tagClass = 'wicket';
                    } else if (c.eventType === 'goal') {
                      eventClass = 'event-goal'; tagLabel = 'GOAL!'; tagClass = 'goal';
                    }

                    return (
                      <div key={c.id || i} className={`commentary-item ${eventClass}`}>
                        <div className="comm-time-badge">
                          {c.period}<br/>{c.minute}'
                        </div>
                        <div className="comm-content">
                          <div className="comm-header">
                            <span className={`comm-event-tag ${tagClass}`}>{tagLabel}</span>
                            {c.actor && <span className="comm-actor">{c.actor} ({c.team || ''})</span>}
                          </div>
                          <p className="comm-text">{c.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Match Scorecard */}
          {activeTab === 'tabScorecard' && (
            <div className="tab-content active">
              <div className="scorecard-grid">
                <div className="stat-box">
                  <span className="stat-title">Sport Category</span>
                  <span className="stat-value">{match.sport}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-title">Start Time</span>
                  <span className="stat-value">{formatDate(match.startTime)}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-title">End Time</span>
                  <span className="stat-value">{match.endTime ? formatDate(match.endTime) : 'N/A'}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-title">Match ID</span>
                  <span className="stat-value">#{match.id}</span>
                </div>
              </div>

              <div className="match-timeline-box">
                <h4><i data-feather="clock"></i> Timeline Breakdown</h4>
                <div className="timeline-bars">
                  {commentaryList.slice(0, 15).map((c, idx) => (
                    <span key={idx} className={`timeline-chip ${c.eventType || 'normal'}`}>
                      {c.minute}' - {(c.eventType || 'commentary').replace('_', ' ').toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Admin Event Simulator */}
          {activeTab === 'tabAdmin' && (
            <div className="tab-content active">
              <PostCommentaryForm matchId={match.id} onSubmit={onPostCommentary} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Form Component for Posting Commentary
function PostCommentaryForm({ matchId, onSubmit }) {
  const [minute, setMinute] = useState(1);
  const [sequence, setSequence] = useState(1);
  const [period, setPeriod] = useState('1st Half');
  const [eventType, setEventType] = useState('commentary');
  const [actor, setActor] = useState('');
  const [team, setTeam] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      minute: parseInt(minute, 10),
      sequence: parseInt(sequence, 10),
      period,
      eventType,
      actor: actor || undefined,
      team: team || undefined,
      message
    });
    setMessage('');
  };

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <h3>Post Live Commentary Event</h3>
      <p className="form-desc">Broadcast a referee or scorer update live over WebSockets to all connected clients.</p>

      <div className="form-row">
        <div className="form-group">
          <label>Minute / Over *</label>
          <input type="number" value={minute} onChange={(e) => setMinute(e.target.value)} min="0" required />
        </div>
        <div className="form-group">
          <label>Sequence # *</label>
          <input type="number" value={sequence} onChange={(e) => setSequence(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Period / Quarter *</label>
          <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Over 14, 1st Half" required />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Event Type *</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} required>
            <option value="commentary">Normal Commentary</option>
            <option value="boundary_6">6 Runs (Cricket / Boundary)</option>
            <option value="boundary_4">4 Runs (Cricket / Boundary)</option>
            <option value="wicket">Wicket Out!</option>
            <option value="goal">GOAL!</option>
            <option value="card_yellow">Yellow Card</option>
            <option value="card_red">Red Card</option>
          </select>
        </div>
        <div className="form-group">
          <label>Player / Actor Name</label>
          <input type="text" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. Virat Kohli / Lionel Messi" />
        </div>
        <div className="form-group">
          <label>Team Name</label>
          <input type="text" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. India / Argentina" />
        </div>
      </div>

      <div className="form-group">
        <label>Event Message *</label>
        <textarea rows="2" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Smashed over deep mid-wicket for a glorious SIX!" required></textarea>
      </div>

      <button type="submit" className="btn btn-primary btn-block">
        <i data-feather="send"></i> Broadcast Live Event via WebSocket
      </button>
    </form>
  );
}

// Form Component for Creating Matches
function CreateMatchModal({ onClose, onSubmit }) {
  const now = new Date();
  const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const formatInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const [sport, setSport] = useState('Cricket');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [startTime, setStartTime] = useState(formatInput(now));
  const [endTime, setEndTime] = useState(formatInput(future));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      sport,
      homeTeam,
      awayTeam,
      homeScore: parseInt(homeScore || 0, 10),
      awayScore: parseInt(awayScore || 0, 10),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString()
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-medium">
        <div className="modal-header">
          <h2><i data-feather="plus-circle"></i> Create New Live Match</h2>
          <button className="close-btn" onClick={onClose}><i data-feather="x"></i></button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Sport Category *</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)} required>
              <option value="Cricket">Cricket</option>
              <option value="Football">Football</option>
              <option value="Basketball">Basketball</option>
              <option value="Tennis">Tennis</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Home Team *</label>
              <input type="text" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="e.g. India" required />
            </div>
            <div className="form-group">
              <label>Away Team *</label>
              <input type="text" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="e.g. Australia" required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Initial Home Score</label>
              <input type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} min="0" />
            </div>
            <div className="form-group">
              <label>Initial Away Score</label>
              <input type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} min="0" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>End Time *</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary"><i data-feather="check"></i> Create Match</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Mount React Root
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
