import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { teacherApi, ApiError, type TeacherInfo } from '../api';

interface TeacherAuthValue {
  teacher: TeacherInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const TeacherAuthContext = createContext<TeacherAuthValue | null>(null);

export function TeacherAuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve the current session from the httpOnly cookie on mount.
    teacherApi.me()
      .then(setTeacher)
      .catch((e) => { if (!(e instanceof ApiError && e.status === 401)) console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    setTeacher(await teacherApi.login(email, password));
  };
  const register = async (email: string, password: string, name: string) => {
    setTeacher(await teacherApi.register(email, password, name));
  };
  const logout = async () => {
    await teacherApi.logout();
    setTeacher(null);
  };

  return (
    <TeacherAuthContext.Provider value={{ teacher, loading, login, register, logout }}>
      {children}
    </TeacherAuthContext.Provider>
  );
}

export function useTeacherAuth(): TeacherAuthValue {
  const ctx = useContext(TeacherAuthContext);
  if (!ctx) throw new Error('useTeacherAuth must be used within TeacherAuthProvider');
  return ctx;
}
