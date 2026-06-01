import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTeacherAuth } from './TeacherAuth';

// Gate teacher pages: redirect to login when there's no authenticated teacher.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { teacher, loading } = useTeacherAuth();
  if (loading) return <div className="teacher-loading">Loading…</div>;
  if (!teacher) return <Navigate to="/teacher/login" replace />;
  return <>{children}</>;
}
