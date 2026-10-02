/**
 * SPORTZ — Live Dashboard & WebSocket Realtime Commentary Client
 */

(function () {
  'use strict';

  // --- State ---
  let matches = [];
  let currentMatch = null;
  let currentSubscribedMatchId = null;
  let commentaryList = [];
  
  let selectedSport = 'all';
  let selectedStatus = 'all';
  let searchQuery = '';
  let activeEventFilter = 'all';

  let socket = null;
  let reconnectInterval = null;

  // --- DOM Elements ---
  const wsStatusBadge = document.getElementById('wsStatusBadge');
  const wsStatusText = document.getElementById('wsStatusText');
  const liveTickerText = document.getElementById('liveTickerText');
  
  const matchGrid = document.getElementById('matchGrid');
  const searchInput = document.getElementById('searchInput');
  const matchCountBadge = document.getElementById('matchCountBadge');
  const btnRefresh = document.getElementById('btnRefresh');

  // Metrics
  const metricTotalMatches = document.getElementById('metricTotalMatches');
  const metricLiveMatches = document.getElementById('metricLiveMatches');
  const metricCommentaryCount = document.getElementById('metricCommentaryCount');

  // Create Modal
  const createMatchModal = document.getElementById('createMatchModal');
  const btnOpenCreateModal = document.getElementById('btnOpenCreateModal');
  const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
  const btnCancelCreateModal = document.getElementById('btnCancelCreateModal');
  const formCreateMatch = document.getElementById('formCreateMatch');

  // Details Modal
  const matchDetailsModal = document.getElementById('matchDetailsModal');
  const btnCloseDetailsModal = document.getElementById('btnCloseDetailsModal');
  const modalSportBadge = document.getElementById('modalSportBadge');
  const modalMatchTitle = document.getElementById('modalMatchTitle');
  const modalStatusBadge = document.getElementById('modalStatusBadge');
  const modalHomeTeam = document.getElementById('modalHomeTeam');
  const modalAwayTeam = document.getElementById('modalAwayTeam');
  const modalHomeScore = document.getElementById('modalHomeScore');
  const modalAwayScore = document.getElementById('modalAwayScore');
  const modalHomeAvatar = document.getElementById('modalHomeAvatar');
  const modalAwayAvatar = document.getElementById('modalAwayAvatar');
  const modalTimeInfo = document.getElementById('modalTimeInfo');
  const modalLivePulse = document.getElementById('modalLivePulse');

  // Detail Tabs
  const detailTabBtns = document.querySelectorAll('.detail-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const commentaryListEl = document.getElementById('commentaryList');
  const subscribedMatchIdEl = document.getElementById('subscribedMatchId');
  const formAddCommentary = document.getElementById('formAddCommentary');
  const timelineBars = document.getElementById('timelineBars');

  // Stat Boxes
  const cardSport = document.getElementById('cardSport');
  const cardStartTime = document.getElementById('cardStartTime');
  const cardEndTime = document.getElementById('cardEndTime');
  const cardMatchId = document.getElementById('cardMatchId');

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    fetchMatches();
    setupEventListeners();
    setupDefaultDates();
    if (window.feather) feather.replace();
  });

  // --- WebSocket Connection ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8080';
    const wsUrl = `${protocol}//${host}/ws`;

    updateWsBadge('connecting', 'WS CONNECTING');

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      updateWsBadge('connected', 'LIVE WS');
      liveTickerText.textContent = 'Connected to Sportz Real-Time Engine via WebSocket';
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }

      // Re-subscribe if details modal is active
      if (currentSubscribedMatchId) {
        subscribeToMatch(currentSubscribedMatchId);
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWsMessage(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      updateWsBadge('offline', 'OFFLINE');
      liveTickerText.textContent = 'WebSocket disconnected. Retrying...';
      triggerReconnect();
    };

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err);
      socket.close();
    };
  }

  function triggerReconnect() {
    if (!reconnectInterval) {
      reconnectInterval = setInterval(() => {
        console.log('Attempting WebSocket reconnect...');
        initWebSocket();
      }, 5000);
    }
  }

  function updateWsBadge(statusClass, labelText) {
    wsStatusBadge.className = `ws-badge ${statusClass}`;
    wsStatusText.textContent = labelText;
  }

  function handleWsMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'Welcome':
        console.log('WebSocket welcome received.');
        break;

      case 'Match Created':
        if (msg.data) {
          onMatchCreatedWS(msg.data);
        }
        break;

      case 'commentary':
        if (msg.data) {
          onCommentaryReceivedWS(msg.data);
        }
        break;

      case 'subscribed':
        console.log(`Subscribed to match #${msg.matchId}`);
        subscribedMatchIdEl.textContent = msg.matchId;
        break;

      case 'unsubscribed':
        console.log(`Unsubscribed from match #${msg.matchId}`);
        break;

      default:
        console.log('Unhandled WS message type:', msg.type);
    }
  }

  function subscribeToMatch(matchId) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (currentSubscribedMatchId && currentSubscribedMatchId !== matchId) {
      socket.send(JSON.stringify({ type: 'unsubscribe', matchId: currentSubscribedMatchId }));
    }
    currentSubscribedMatchId = matchId;
    socket.send(JSON.stringify({ type: 'subscribe', matchId: matchId }));
  }

  function unsubscribeFromMatch(matchId) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (matchId) {
      socket.send(JSON.stringify({ type: 'unsubscribe', matchId: matchId }));
    }
    currentSubscribedMatchId = null;
  }

  // --- Realtime Handlers ---
  function onMatchCreatedWS(newMatch) {
    // Check if match already exists
    const idx = matches.findIndex(m => m.id === newMatch.id);
    if (idx !== -1) {
      matches[idx] = newMatch;
    } else {
      matches.unshift(newMatch);
    }

    renderMatchGrid();
    updateMetrics();

    liveTickerText.textContent = `NEW MATCH CREATED: ${newMatch.homeTeam} vs ${newMatch.awayTeam} (${newMatch.sport})`;
  }

  function onCommentaryReceivedWS(commData) {
    // Increment total commentary metric
    const curCount = parseInt(metricCommentaryCount.textContent || '0', 10);
    metricCommentaryCount.textContent = curCount + 1;

    // If currently viewing this match, append commentary
    if (currentMatch && currentMatch.id === commData.matchId) {
      commentaryList.unshift(commData);
      renderCommentaryFeed();
      renderTimeline();

      // Trigger ticker highlight
      const eventText = `${commData.eventType.toUpperCase()} in ${commData.period}: ${commData.message}`;
      liveTickerText.textContent = `LIVE EVENT: ${eventText}`;
    }
  }

  // --- REST API Calls ---
  async function fetchMatches() {
    try {
      const res = await fetch('/matches?limit=100');
      if (!res.ok) throw new Error('Failed to fetch matches');
      const json = await res.json();
      matches = json.data || [];
      renderMatchGrid();
      updateMetrics();
    } catch (err) {
      console.error(err);
      matchGrid.innerHTML = `
        <div class="empty-state">
          <i data-feather="alert-circle"></i>
          <p>Failed to load matches from backend REST API.</p>
        </div>
      `;
      if (window.feather) feather.replace();
    }
  }

  async function fetchCommentary(matchId) {
    commentaryListEl.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading live commentary entries...</p>
      </div>
    `;

    try {
      const res = await fetch(`/matches/${matchId}/commentary?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch commentary');
      const json = await res.json();
      commentaryList = json.data || [];
      renderCommentaryFeed();
      renderTimeline();
    } catch (err) {
      console.error(err);
      commentaryList = [];
      renderCommentaryFeed();
    }
  }

  async function createMatch(payload) {
    try {
      const res = await fetch('/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error creating match');
      }

      const json = await res.json();
      closeCreateModal();
      formCreateMatch.reset();
      setupDefaultDates();
      
      // Auto open details for the newly created match
      if (json.data) {
        openMatchDetails(json.data);
      }
    } catch (err) {
      alert(`Match creation failed: ${err.message}`);
    }
  }

  async function postCommentary(matchId, payload) {
    try {
      const res = await fetch(`/matches/${matchId}/commentary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error posting commentary');
      }

      formAddCommentary.reset();
      document.getElementById('commMinute').value = "1";
      document.getElementById('commSequence').value = "1";
      document.getElementById('commPeriod').value = "1st Half";
      
      // Switch back to Commentary tab
      switchTab('tabCommentary');
    } catch (err) {
      alert(`Commentary post failed: ${err.message}`);
    }
  }

  // --- Rendering Functions ---
  function renderMatchGrid() {
    let filtered = matches.filter(m => {
      // Filter by sport
      if (selectedSport !== 'all' && m.sport.toLowerCase() !== selectedSport.toLowerCase()) {
        return false;
      }
      // Filter by status
      if (selectedStatus !== 'all' && m.status.toLowerCase() !== selectedStatus.toLowerCase()) {
        return false;
      }
      // Filter by search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const homeMatch = m.homeTeam.toLowerCase().includes(q);
        const awayMatch = m.awayTeam.toLowerCase().includes(q);
        const sportMatch = m.sport.toLowerCase().includes(q);
        if (!homeMatch && !awayMatch && !sportMatch) return false;
      }
      return true;
    });

    matchCountBadge.textContent = `${filtered.length} matches`;

    if (filtered.length === 0) {
      matchGrid.innerHTML = `
        <div class="empty-state">
          <i data-feather="inbox"></i>
          <p>No matches match the selected criteria.</p>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    matchGrid.innerHTML = filtered.map(m => {
      const isLive = m.status === 'live';
      const homeInitial = m.homeTeam.substring(0, 1).toUpperCase();
      const awayInitial = m.awayTeam.substring(0, 1).toUpperCase();

      return `
        <div class="match-card ${isLive ? 'is-live' : ''}" data-id="${m.id}">
          <div class="card-top">
            <span class="sport-tag">${escapeHtml(m.sport)}</span>
            <span class="status-badge-sm ${m.status}">
              ${isLive ? '<span class="chip-dot live"></span> LIVE' : escapeHtml(m.status)}
            </span>
          </div>

          <div class="card-teams">
            <div class="team-row">
              <div class="team-info">
                <div class="team-badge-circle">${homeInitial}</div>
                <span class="team-name">${escapeHtml(m.homeTeam)}</span>
              </div>
              <span class="team-score">${m.homeScore ?? 0}</span>
            </div>

            <div class="team-row">
              <div class="team-info">
                <div class="team-badge-circle">${awayInitial}</div>
                <span class="team-name">${escapeHtml(m.awayTeam)}</span>
              </div>
              <span class="team-score">${m.awayScore ?? 0}</span>
            </div>
          </div>

          <div class="card-footer">
            <span>Started: ${formatDate(m.startTime)}</span>
            <span class="action-link">View Live Feed <i data-feather="chevron-right"></i></span>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();

    // Attach click listeners to cards
    document.querySelectorAll('.match-card').forEach(card => {
      card.addEventListener('click', () => {
        const matchId = parseInt(card.getAttribute('data-id'), 10);
        const matchObj = matches.find(m => m.id === matchId);
        if (matchObj) {
          openMatchDetails(matchObj);
        }
      });
    });
  }

  function renderCommentaryFeed() {
    let filtered = commentaryList.filter(item => {
      if (activeEventFilter === 'boundary') {
        return item.eventType === 'boundary_6' || item.eventType === 'boundary_4' || item.eventType === 'goal';
      }
      if (activeEventFilter === 'wicket') {
        return item.eventType === 'wicket' || item.eventType === 'card_yellow' || item.eventType === 'card_red';
      }
      return true;
    });

    if (filtered.length === 0) {
      commentaryListEl.innerHTML = `
        <div class="empty-state">
          <i data-feather="message-square"></i>
          <p>No commentary matches this filter.</p>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    commentaryListEl.innerHTML = filtered.map(c => {
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

      return `
        <div class="commentary-item ${eventClass}">
          <div class="comm-time-badge">
            ${c.period || ''}<br>${c.minute}'
          </div>
          <div class="comm-content">
            <div class="comm-header">
              <span class="comm-event-tag ${tagClass}">${tagLabel}</span>
              ${c.actor ? `<span class="comm-actor">${escapeHtml(c.actor)} (${escapeHtml(c.team || '')})</span>` : ''}
            </div>
            <p class="comm-text">${escapeHtml(c.message)}</p>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function renderTimeline() {
    if (!commentaryList || commentaryList.length === 0) {
      timelineBars.innerHTML = '<span style="font-size:0.8rem; color:var(--text-dim);">No key events recorded.</span>';
      return;
    }

    timelineBars.innerHTML = commentaryList.slice(0, 15).map(c => {
      const type = c.eventType || 'commentary';
      return `<span class="timeline-chip ${type}">${c.minute}' - ${escapeHtml(type.replace('_', ' ').toUpperCase())}</span>`;
    }).join('');
  }

  function updateMetrics() {
    metricTotalMatches.textContent = matches.length;
    const liveCount = matches.filter(m => m.status === 'live').length;
    metricLiveMatches.textContent = liveCount;
  }

  // --- Modal Controllers ---
  function openMatchDetails(matchObj) {
    currentMatch = matchObj;
    
    // Set Header Info
    modalSportBadge.textContent = matchObj.sport.toUpperCase();
    modalMatchTitle.textContent = `${matchObj.homeTeam} vs ${matchObj.awayTeam}`;
    modalStatusBadge.textContent = matchObj.status.toUpperCase();
    modalStatusBadge.className = `status-badge ${matchObj.status}`;

    modalHomeTeam.textContent = matchObj.homeTeam;
    modalAwayTeam.textContent = matchObj.awayTeam;
    modalHomeScore.textContent = matchObj.homeScore ?? 0;
    modalAwayScore.textContent = matchObj.awayScore ?? 0;

    modalHomeAvatar.textContent = matchObj.homeTeam.substring(0, 1).toUpperCase();
    modalAwayAvatar.textContent = matchObj.awayTeam.substring(0, 1).toUpperCase();

    modalTimeInfo.textContent = `Started: ${formatDate(matchObj.startTime)}`;

    if (matchObj.status === 'live') {
      modalLivePulse.style.display = 'flex';
    } else {
      modalLivePulse.style.display = 'none';
    }

    // Set Card Stat values
    cardSport.textContent = matchObj.sport;
    cardStartTime.textContent = formatDate(matchObj.startTime);
    cardEndTime.textContent = matchObj.endTime ? formatDate(matchObj.endTime) : 'N/A';
    cardMatchId.textContent = `#${matchObj.id}`;

    // Reset Tabs
    switchTab('tabCommentary');

    // Subscribe to WebSocket channel for this match
    subscribeToMatch(matchObj.id);

    // Fetch existing commentary
    fetchCommentary(matchObj.id);

    matchDetailsModal.classList.add('active');
  }

  function closeMatchDetails() {
    matchDetailsModal.classList.remove('active');
    if (currentMatch) {
      unsubscribeFromMatch(currentMatch.id);
      currentMatch = null;
    }
  }

  function openCreateModal() {
    createMatchModal.classList.add('active');
  }

  function closeCreateModal() {
    createMatchModal.classList.remove('active');
  }

  function switchTab(tabId) {
    detailTabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    tabContents.forEach(content => {
      if (content.id === tabId) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  // --- Setup Event Listeners ---
  function setupEventListeners() {
    // Sport Filters
    document.querySelectorAll('.sport-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sport-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSport = btn.getAttribute('data-sport');
        renderMatchGrid();
      });
    });

    // Status Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedStatus = chip.getAttribute('data-status');
        renderMatchGrid();
      });
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderMatchGrid();
    });

    // Refresh Sync Button
    btnRefresh.addEventListener('click', () => {
      fetchMatches();
    });

    // Modals Open/Close
    btnOpenCreateModal.addEventListener('click', openCreateModal);
    btnCloseCreateModal.addEventListener('click', closeCreateModal);
    btnCancelCreateModal.addEventListener('click', closeCreateModal);
    btnCloseDetailsModal.addEventListener('click', closeMatchDetails);

    // Detail Tabs Switcher
    detailTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // Event Filter Chips in Commentary Tab
    document.querySelectorAll('[data-event-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-event-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeEventFilter = chip.getAttribute('data-event-filter');
        renderCommentaryFeed();
      });
    });

    // Form Submit: Create Match
    formCreateMatch.addEventListener('submit', (e) => {
      e.preventDefault();

      const sport = document.getElementById('createSport').value;
      const homeTeam = document.getElementById('createHomeTeam').value;
      const awayTeam = document.getElementById('createAwayTeam').value;
      const homeScore = parseInt(document.getElementById('createHomeScore').value || '0', 10);
      const awayScore = parseInt(document.getElementById('createAwayScore').value || '0', 10);
      const startTime = new Date(document.getElementById('createStartTime').value).toISOString();
      const endTime = new Date(document.getElementById('createEndTime').value).toISOString();

      createMatch({
        sport,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        startTime,
        endTime
      });
    });

    // Form Submit: Add Commentary Event
    formAddCommentary.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!currentMatch) return;

      const minute = parseInt(document.getElementById('commMinute').value, 10);
      const sequence = parseInt(document.getElementById('commSequence').value, 10);
      const period = document.getElementById('commPeriod').value;
      const eventType = document.getElementById('commEventType').value;
      const actor = document.getElementById('commActor').value;
      const team = document.getElementById('commTeam').value;
      const message = document.getElementById('commMessage').value;

      postCommentary(currentMatch.id, {
        minute,
        sequence,
        period,
        eventType,
        actor: actor || undefined,
        team: team || undefined,
        message
      });
    });
  }

  // --- Utilities ---
  function setupDefaultDates() {
    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hrs later

    const formatForInput = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const startInput = document.getElementById('createStartTime');
    const endInput = document.getElementById('createEndTime');

    if (startInput) startInput.value = formatForInput(now);
    if (endInput) endInput.value = formatForInput(future);
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
      return isoStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
