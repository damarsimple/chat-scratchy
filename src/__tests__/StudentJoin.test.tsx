import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StudentJoin } from '../StudentJoin'

vi.mock('../api', () => ({
  joinClass: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

import { joinClass } from '../api'
const mockJoinClass = vi.mocked(joinClass)

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('StudentJoin', () => {
  it('renders join form with inputs and button', () => {
    render(<StudentJoin onJoined={() => {}} />)
    expect(screen.getByPlaceholderText('課程代碼')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('你的名字')).toBeInTheDocument()
    expect(screen.getByText('開始學習')).toBeInTheDocument()
  })

  it('uppercases class code input', async () => {
    const user = userEvent.setup()
    render(<StudentJoin onJoined={() => {}} />)
    const codeInput = screen.getByPlaceholderText('課程代碼')
    await user.type(codeInput, 'abc123')
    expect(codeInput).toHaveValue('ABC123')
  })

  it('disables submit when inputs are empty', () => {
    render(<StudentJoin onJoined={() => {}} />)
    expect(screen.getByText('開始學習')).toBeDisabled()
  })

  it('calls joinClass and onJoined on success', async () => {
    const onJoined = vi.fn()
    mockJoinClass.mockResolvedValue({
      studentId: 's1',
      clientToken: 'tok',
      classId: 'c1',
      className: 'Class A',
      displayName: 'Student',
    })

    const user = userEvent.setup()
    render(<StudentJoin onJoined={onJoined} />)

    await user.type(screen.getByPlaceholderText('課程代碼'), 'CODE')
    await user.type(screen.getByPlaceholderText('你的名字'), 'Alice')
    await user.click(screen.getByText('開始學習'))

    await waitFor(() => {
      expect(mockJoinClass).toHaveBeenCalledWith('CODE', 'Alice')
    })
    expect(onJoined).toHaveBeenCalledWith({
      studentId: 's1',
      clientToken: 'tok',
      classId: 'c1',
      className: 'Class A',
      displayName: 'Student',
    })
  })

  it('shows error on 404', async () => {
    const { ApiError } = await import('../api')
    mockJoinClass.mockRejectedValue(new ApiError(404, 'Not found'))

    const user = userEvent.setup()
    render(<StudentJoin onJoined={() => {}} />)

    await user.type(screen.getByPlaceholderText('課程代碼'), 'BAD')
    await user.type(screen.getByPlaceholderText('你的名字'), 'Bob')
    await user.click(screen.getByText('開始學習'))

    await waitFor(() => {
      expect(screen.getByText('找不到這個課程代碼')).toBeInTheDocument()
    })
  })

  it('shows generic error on other failures', async () => {
    mockJoinClass.mockRejectedValue(new Error('network'))

    const user = userEvent.setup()
    render(<StudentJoin onJoined={() => {}} />)

    await user.type(screen.getByPlaceholderText('課程代碼'), 'CODE')
    await user.type(screen.getByPlaceholderText('你的名字'), 'Bob')
    await user.click(screen.getByText('開始學習'))

    await waitFor(() => {
      expect(screen.getByText('加入失敗，請再試一次')).toBeInTheDocument()
    })
  })

  it('submits on Enter key in name field', async () => {
    mockJoinClass.mockResolvedValue({
      studentId: 's1', clientToken: 'tok', classId: 'c1',
      className: 'Class A', displayName: 'Student',
    })
    const onJoined = vi.fn()

    const user = userEvent.setup()
    render(<StudentJoin onJoined={onJoined} />)

    await user.type(screen.getByPlaceholderText('課程代碼'), 'CODE')
    await user.type(screen.getByPlaceholderText('你的名字'), 'Alice{Enter}')

    await waitFor(() => {
      expect(mockJoinClass).toHaveBeenCalled()
    })
  })
})
