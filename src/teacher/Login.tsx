import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTeacherAuth } from './TeacherAuth';
import { ApiError } from '../api';

// Combined login / register page for teachers.
export function Login() {
  const { teacher, loading, login, register } = useTeacherAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in → go to dashboard.
  if (!loading && teacher) return <Navigate to="/teacher" replace />;

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) { setError('Email and password are required'); return; }
    if (mode === 'register' && !name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      navigate('/teacher', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError('Invalid email or password');
      else if (e instanceof ApiError && e.status === 409) setError('That email is already registered');
      else setError('Something went wrong, please try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="teacher-auth-page">
      <div className="teacher-auth-card">
        <h1>Teacher {mode === 'login' ? 'Login' : 'Sign Up'}</h1>
        <p className="teacher-auth-sub">Scratchy classroom dashboard</p>

        {mode === 'register' && (
          <input
            className="teacher-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="teacher-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <input
          className="teacher-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />

        {error && <div className="teacher-auth-error">{error}</div>}

        <button className="teacher-btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <button
          className="teacher-link-btn"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
