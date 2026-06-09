import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTeacherAuth } from './TeacherAuth';
import { useI18n } from '../i18n';
import { ApiError } from '../api';

export function Login() {
  const { teacher, loading, login, register } = useTeacherAuth();
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && teacher) return <Navigate to="/teacher" replace />;

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) { setError(t('Email and password are required')); return; }
    if (mode === 'register' && !name.trim()) { setError(t('Name is required')); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      navigate('/teacher', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError(t('Invalid email or password'));
      else if (e instanceof ApiError && e.status === 409) setError(t('That email is already registered'));
      else setError(t('Something went wrong, please try again'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="teacher-auth-page">
      <div className="teacher-auth-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>{t('Teacher Login')}</h1>
          <button className="teacher-link-btn" onClick={toggleLang} style={{ fontSize: 13, fontWeight: 700 }}>{lang === 'zh' ? 'EN' : '中'}</button>
        </div>
        <p className="teacher-auth-sub">{t('Scratchy classroom dashboard')}</p>

        {mode === 'register' && (
          <input
            className="teacher-input"
            placeholder={t('Your name')}
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
          placeholder={t('Password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />

        {error && <div className="teacher-auth-error">{error}</div>}

        <button className="teacher-btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '…' : mode === 'login' ? t('Log in') : t('Create account')}
        </button>

        <button
          className="teacher-link-btn"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? t('Need an account? Sign up') : t('Have an account? Log in')}
        </button>
      </div>
    </div>
  );
}
