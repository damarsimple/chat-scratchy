import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Classes } from '../../teacher/Classes'

vi.mock('../../teacher/TeacherAuth', () => ({
  useTeacherAuth: vi.fn(() => ({
    teacher: { id: 't1', email: 't@test.com', name: 'Test Teacher' },
    logout: vi.fn(),
  })),
}))

vi.mock('../../api', () => ({
  teacherApi: {
    listClasses: vi.fn(),
    createClass: vi.fn(),
  },
}))

import { teacherApi } from '../../api'
const mockTeacherApi = vi.mocked(teacherApi)

function renderClasses() {
  return render(
    <MemoryRouter>
      <Classes />
    </MemoryRouter>,
  )
}

describe('Classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockTeacherApi.listClasses.mockReturnValue(new Promise(() => {}))
    renderClasses()
    expect(screen.getByText('載入班級中…')).toBeInTheDocument()
  })

  it('renders class list after loading', async () => {
    mockTeacherApi.listClasses.mockResolvedValue([
      { id: 'c1', name: 'Grade 5', joinCode: 'ABC123', createdAt: '2026-01-01', studentCount: 10, sessionCount: 25 },
      { id: 'c2', name: 'Grade 6', joinCode: 'DEF456', createdAt: '2026-01-02', studentCount: 8, sessionCount: 15 },
    ])
    renderClasses()

    await waitFor(() => {
      expect(screen.getByText('Grade 5')).toBeInTheDocument()
    })
    expect(screen.getByText('Grade 6')).toBeInTheDocument()
  })

  it('shows empty state when no classes', async () => {
    mockTeacherApi.listClasses.mockResolvedValue([])
    renderClasses()

    await waitFor(() => {
      expect(screen.getByText(/尚無班級/)).toBeInTheDocument()
    })
  })

  it('creates a new class', async () => {
    mockTeacherApi.listClasses.mockResolvedValue([])
    mockTeacherApi.createClass.mockResolvedValue({
      id: 'c1', name: 'New Class', joinCode: 'NEW123',
      createdAt: '2026-01-01', studentCount: 0, sessionCount: 0,
    })

    renderClasses()
    await waitFor(() => {
      expect(screen.getByText(/尚無班級/)).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/新班級名稱/), 'New Class')
    await user.click(screen.getByText(/建立班級/))

    await waitFor(() => {
      expect(mockTeacherApi.createClass).toHaveBeenCalledWith('New Class')
    })
  })
})
