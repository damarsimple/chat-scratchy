import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './teacher/teacher.css'
import App from './App.tsx'
import { TeacherAuthProvider } from './teacher/TeacherAuth'
import { ProtectedRoute } from './teacher/ProtectedRoute'
import { Login } from './teacher/Login'
import { Classes } from './teacher/Classes'
import { ClassDetail } from './teacher/ClassDetail'
import { SessionViewer } from './teacher/SessionViewer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Student app */}
        <Route path="/" element={<App />} />

        {/* Teacher dashboard */}
        <Route path="/teacher/login" element={<TeacherAuthProvider><Login /></TeacherAuthProvider>} />
        <Route
          path="/teacher/*"
          element={
            <TeacherAuthProvider>
              <ProtectedRoute>
                <Routes>
                  <Route index element={<Classes />} />
                  <Route path="classes/:classId" element={<ClassDetail />} />
                  <Route path="sessions/:sessionId" element={<SessionViewer />} />
                </Routes>
              </ProtectedRoute>
            </TeacherAuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
