import { useState } from 'react';
import { joinClass, ApiError, type StudentIdentity } from './api';
import { useI18n } from './i18n';

// Gate shown before the student workspace loads when there's no saved identity.
// Student enters a class code + display name to join their teacher's class.
export function StudentJoin({ onJoined }: { onJoined: (id: StudentIdentity) => void }) {
  const { lang } = useI18n();
  const zh = lang === 'zh';
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
        setError(zh ? '找不到這個課程代碼' : 'Class code not found');
      } else {
        setError(zh ? '加入失敗，請再試一次' : 'Could not join, please try again');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="join-gate">
      <div className="join-card">
        <h1>{zh ? '歡迎來到 Scratchy！' : 'Welcome to Scratchy!'}</h1>
        <p>{zh ? '請輸入老師給你的課程代碼和你的名字。' : 'Enter the class code from your teacher and your name.'}</p>
        <input
          className="join-input"
          placeholder={zh ? '課程代碼' : 'Class code'}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoFocus
        />
        <input
          className="join-input"
          placeholder={zh ? '你的名字' : 'Your name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
        {error && <div className="join-error">{error}</div>}
        <button className="join-btn" onClick={() => void submit()} disabled={busy || !code.trim() || !name.trim()}>
          {busy ? (zh ? '加入中…' : 'Joining…') : (zh ? '開始學習' : 'Start learning')}
        </button>
      </div>
    </div>
  );
}
