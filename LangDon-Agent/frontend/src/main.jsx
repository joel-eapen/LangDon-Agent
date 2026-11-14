import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || 'Something went wrong');
  }
  return body;
}

function formatDate(value) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  const loadConversations = useCallback(async (accessToken) => {
    setLoadingConversations(true);
    try {
      const { data } = await request('/api/conversations?limit=50', { token: accessToken });
      setConversations(data.conversations);
      setSelectedId((current) => current && data.conversations.some(({ id }) => id === current)
        ? current
        : data.conversations[0]?.id || null);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error.message);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    request('/api/auth/refresh', { method: 'POST' })
      .then(({ data }) => {
        setToken(data.accessToken);
        setUser(data.user);
        loadConversations(data.accessToken);
      })
      .catch(() => {});
  }, [loadConversations]);

  useEffect(() => {
    if (!token || !selectedId) {
      setMetadata(null);
      return;
    }
    request(`/api/conversations/${selectedId}`, { token })
      .then(({ data }) => setMetadata(data.metadata))
      .catch((error) => setWorkspaceError(error.message));
  }, [selectedId, token]);

  const selectedConversation = useMemo(
    () => conversations.find(({ id }) => id === selectedId),
    [conversations, selectedId],
  );

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const payload = authMode === 'register'
        ? authForm
        : { email: authForm.email, password: authForm.password };
      const { data } = await request(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(data.accessToken);
      setUser(data.user);
      await loadConversations(data.accessToken);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const createConversation = async (event) => {
    event.preventDefault();
    const title = newTitle.trim() || 'Untitled conversation';
    try {
      const { data } = await request('/api/conversations', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title,
          timeZone: user.timezone || 'UTC',
        }),
      });
      setConversations((current) => [data.conversation, ...current]);
      setSelectedId(data.conversation.id);
      setNewTitle('');
      setShowNewConversation(false);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error.message);
    }
  };

  const renameConversation = async (event) => {
    event.preventDefault();
    const title = event.currentTarget.elements.title.value.trim();
    if (!title || !selectedId) return;
    try {
      const { data } = await request(`/api/conversations/${selectedId}/title`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ title }),
      });
      setConversations((current) => current.map((conversation) => (
        conversation.id === selectedId ? data.conversation : conversation
      )));
      setEditingTitle(false);
      setWorkspaceError('');
    } catch (error) {
      setWorkspaceError(error.message);
    }
  };

  const logout = async () => {
    await request('/api/auth/logout', {
      method: 'POST',
      token,
    }).catch(() => {});
    setUser(null);
    setToken('');
    setConversations([]);
    setSelectedId(null);
  };

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">L</div>
          <p className="eyebrow">LANGDON / PERSONAL AGENT</p>
          <h1>{authMode === 'login' ? 'A calmer way to think.' : 'Make room for better ideas.'}</h1>
          <p className="intro">Search, reflect, and keep every useful thread close at hand.</p>
          <div className="tabs">
            <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
            <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === 'register' && (
              <label>Name<input name="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required /></label>
            )}
            <label>Email<input name="email" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required /></label>
            <label>Password<input name="password" type="password" minLength="6" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required /></label>
            {authMode === 'register' && (
              <label>Timezone<input name="timezone" value={authForm.timezone} onChange={(event) => setAuthForm({ ...authForm, timezone: event.target.value })} required /></label>
            )}
            {authError && <p className="error">{authError}</p>}
            <button className="primary-button" disabled={authLoading}>{authLoading ? 'Opening LangDon...' : authMode === 'login' ? 'Enter workspace' : 'Get started'}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand"><span className="brand-mark small">L</span><span>LangDon</span></div>
          <button type="button" className="new-button" onClick={() => setShowNewConversation(true)}><span>+</span> New conversation</button>
        </div>
        <div className="conversation-heading"><span>Your conversations</span><span>{conversations.length}</span></div>
        <div className="conversation-list">
          {loadingConversations && <p className="empty-state">Loading your threads...</p>}
          {!loadingConversations && conversations.length === 0 && <p className="empty-state">Your first idea is waiting.</p>}
          {conversations.map((conversation) => (
            <button type="button" className={`conversation-item ${conversation.id === selectedId ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
              <span className="conversation-icon">◌</span>
              <span className="conversation-copy"><strong>{conversation.title || 'Untitled conversation'}</strong><small>{formatDate(conversation.last_message_at || conversation.created_at)}</small></span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="user-chip"><span className="avatar">{user.name?.[0]?.toUpperCase() || 'U'}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
          <button type="button" className="logout-button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div><p className="eyebrow">CONVERSATION WORKSPACE</p><h2>{selectedConversation?.title || 'Your workspace'}</h2></div>
          {selectedConversation && <button type="button" className="ghost-button" onClick={() => setEditingTitle(true)}>Rename <span>↗</span></button>}
        </header>
        {workspaceError && <p className="workspace-error">{workspaceError}</p>}
        {selectedConversation ? (
          <div className="workspace-content">
            <div className="welcome-panel"><span className="panel-dot" /><p>Conversation ready</p><h3>A thoughtful space for your next question.</h3><span className="panel-line" /></div>
            <div className="metadata-grid">
              <div><span>Created</span><strong>{formatDate(metadata?.created_at || selectedConversation.created_at)}</strong></div>
              <div><span>Last activity</span><strong>{formatDate(metadata?.last_message_at)}</strong></div>
              <div><span>Messages</span><strong>{metadata?.message_count ?? 0}</strong></div>
            </div>
            <div className="coming-soon"><span>✦</span><div><strong>Chat is coming next</strong><p>The conversation APIs are connected. Once messaging is enabled, this is where your assistant and search results will appear.</p></div></div>
          </div>
        ) : (
          <div className="empty-workspace"><span className="empty-orbit">✦</span><h3>Start with a blank page.</h3><p>Create a conversation to begin collecting ideas, questions, and useful discoveries.</p><button type="button" className="primary-button" onClick={() => setShowNewConversation(true)}>Create conversation</button></div>
        )}
      </section>
      {showNewConversation && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowNewConversation(false)}><form className="modal" onSubmit={createConversation}><button type="button" className="modal-close" onClick={() => setShowNewConversation(false)}>×</button><p className="eyebrow">NEW THREAD</p><h3>Name your conversation.</h3><p className="muted">Give this space a title you will recognize later.</p><label>Title<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Weekend research" maxLength="200" /></label><button className="primary-button">Create conversation</button></form></div>}
      {editingTitle && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingTitle(false)}><form className="modal" onSubmit={renameConversation}><button type="button" className="modal-close" onClick={() => setEditingTitle(false)}>×</button><p className="eyebrow">EDIT TITLE</p><h3>Rename this thread.</h3><label>Title<input name="title" autoFocus defaultValue={selectedConversation?.title || ''} maxLength="200" /></label><button className="primary-button">Save title</button></form></div>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
