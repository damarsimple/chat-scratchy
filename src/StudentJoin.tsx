import { useState } from 'react';
import { joinClass, ApiError, type StudentIdentity } from './api';
import { useI18n } from './i18n';

export function StudentJoin({ onJoined }: { onJoined: (id: StudentIdentity) => void }) {
  const { t, lang, toggleLang } = useI18n();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const id = await joinClass(code.trim(), name.trim());
      onJoined(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError(t('Class code not found'));
      } else {
        setError(t('Could not join, please try again'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="join-gate">
      <div className="join-card">
        <button className="join-lang-btn" onClick={toggleLang}>{lang === 'zh' ? 'EN' : '中'}</button>
        <h1>{t('Welcome to Scratchy!')}</h1>
        <p>{t('Enter the class code from your teacher and your name.')}</p>
        <input
          className="join-input"
          placeholder={t('Class code')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoFocus
        />
        <input
          className="join-input"
          placeholder={t('Your name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
        {error && <div className="join-error">{error}</div>}
        <button className="join-btn" onClick={() => void submit()} disabled={busy || !code.trim() || !name.trim()}>
          {busy ? t('Joining…') : t('Start learning')}
        </button>
      </div>
    </div>
  );
}
