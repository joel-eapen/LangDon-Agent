import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || 'Something went wrong');
  }
  return body;
}

function App() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    request('/api/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const data = await request(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'register'
          ? form
          : { email: form.email, password: form.password }),
      });
      setAccessToken(data.data.accessToken);
      setUser(data.data.user);
      setMessage(mode === 'register' ? 'Account created.' : 'Welcome back.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (allSessions = false) => {
    await request(`/api/auth/${allSessions ? 'logout-all' : 'logout'}`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    }).catch((error) => setMessage(error.message));
    setAccessToken('');
    setUser(null);
    setMessage('You have been logged out.');
  };

  if (user) {
    return (
      <main className="shell">
        <section className="card profile-card">
          <div className="eyebrow">MINIMI CHAT AGENT</div>
          <h1>Welcome, {user.name}.</h1>
          <p className="muted">Your account is ready for the chat experience.</p>
          <div className="profile">
            <span>{user.email}</span>
            <span>{user.timezone}</span>
          </div>
          {message && <p className="notice">{message}</p>}
          <div className="actions">
            <button type="button" onClick={() => logout(false)}>Log out</button>
            <button type="button" className="secondary" onClick={() => logout(true)}>
              Log out everywhere
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">MINIMI CHAT AGENT</div>
        <h1>{mode === 'login' ? 'Welcome back.' : 'Start a new conversation.'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to continue to your personal assistant.'
            : 'Create your account and keep your conversations in one place.'}
        </p>

        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Name
              <input name="name" value={form.name} onChange={updateField} required />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={updateField} minLength="6" required />
          </label>
          {mode === 'register' && (
            <label>
              Timezone
              <input name="timezone" value={form.timezone} onChange={updateField} required />
            </label>
          )}
          {message && <p className="error">{message}</p>}
          <button className="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
