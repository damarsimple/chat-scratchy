import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../../teacher/Login'

vi.mock('../../teacher/TeacherAuth', () => ({
  useTeacherAuth: vi.fn(() => ({
    teacher: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  })),
}))

vi.mock('../../api', () => ({
  teacherApi: {
    me: vi.fn().mockRejectedValue({ status: 401 }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

import { useTeacherAuth } from '../../teacher/TeacherAuth'
import { teacherApi } from '../../api'
const mockUseTeacherAuth = vi.mocked(useTeacherAuth)
const mockTeacherApi = vi.mocked(teacherApi)

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTeacherAuth.mockReturnValue({
      teacher: null,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('renders login form by default', () => {
    renderLogin()
    expect(screen.getByText('教師登入')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
  })

  it('switches to register mode', async () => {
    renderLogin()
    const user = userEvent.setup()
    await user.click(screen.getByText('沒有帳號？註冊'))
    expect(screen.getByText('建立帳號')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/名字/)).toBeInTheDocument()
  })

  it('calls login on submit', async () => {
    const loginFn = vi.fn().mockResolvedValue(undefined)
    mockUseTeacherAuth.mockReturnValue({
      teacher: null,
      loading: false,
      login: loginFn,
      register: vi.fn(),
      logout: vi.fn(),
    })

    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Email'), 't@test.com')
    await user.type(screen.getByPlaceholderText(/密碼/), 'pass123')
    await user.click(screen.getByText('登入'))

    await waitFor(() => {
      expect(loginFn).toHaveBeenCalledWith('t@test.com', 'pass123')
    })
  })

  it('shows error on invalid credentials', async () => {
    const { ApiError } = await import('../../api')
    const loginFn = vi.fn().mockRejectedValue(new ApiError(401, 'Invalid'))
    mockUseTeacherAuth.mockReturnValue({
      teacher: null,
      loading: false,
      login: loginFn,
      register: vi.fn(),
      logout: vi.fn(),
    })

    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Email'), 't@test.com')
    await user.type(screen.getByPlaceholderText(/密碼/), 'wrong')
    await user.click(screen.getByText('登入'))

    await waitFor(() => {
      expect(screen.getByText('電子郵件或密碼錯誤')).toBeInTheDocument()
    })
  })
})
