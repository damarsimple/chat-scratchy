import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ObjectivesManager } from '../../teacher/ObjectivesManager'

vi.mock('../../api', () => ({
  teacherApi: {
    listObjectives: vi.fn(),
    createObjective: vi.fn(),
    updateObjective: vi.fn(),
    deleteObjective: vi.fn(),
  },
  OBJECTIVE_LABELS: {
    animation: 'Simple Animation',
    'cat-mouse': 'Cat Chasing Mouse',
    quiz: 'Quiz Game',
    pong: 'Pong / Bounce',
    falling: 'Falling Objects',
  },
}))

import { teacherApi } from '../../api'
const mockTeacherApi = vi.mocked(teacherApi)

describe('ObjectivesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows objective count in header', async () => {
    mockTeacherApi.listObjectives.mockResolvedValue([
      { id: 'o1', title: 'Make a game', description: 'Build a pong game', checkKey: 'pong', order: 0 },
      { id: 'o2', title: 'Add scoring', description: 'Track score', checkKey: null, order: 1 },
    ])

    render(<ObjectivesManager classId="c1" />)

    await waitFor(() => {
      expect(screen.getByText(/Objectives \(2\)/)).toBeInTheDocument()
    })
  })

  it('expands to show objectives when header is clicked', async () => {
    mockTeacherApi.listObjectives.mockResolvedValue([
      { id: 'o1', title: 'Make a game', description: 'Build a pong game', checkKey: 'pong', order: 0 },
    ])

    render(<ObjectivesManager classId="c1" />)

    await waitFor(() => {
      expect(screen.getByText(/Objectives \(1\)/)).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText(/Objectives \(1\)/))

    expect(screen.getByText('Make a game')).toBeInTheDocument()
    expect(screen.getByText('Build a pong game')).toBeInTheDocument()
    expect(screen.getByText(/auto: Pong/)).toBeInTheDocument()
  })

  it('creates a new objective', async () => {
    mockTeacherApi.listObjectives.mockResolvedValue([])
    mockTeacherApi.createObjective.mockResolvedValue({
      id: 'o1', title: 'New Task', description: 'Do something', checkKey: null, order: 0,
    })

    render(<ObjectivesManager classId="c1" />)

    await waitFor(() => {
      expect(screen.getByText(/Objectives \(0\)/)).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText(/Objectives \(0\)/))

    await user.type(screen.getByPlaceholderText(/New objective title/), 'New Task')
    await user.type(screen.getByPlaceholderText(/Description shown/), 'Do something')
    await user.click(screen.getByText(/Add objective/))

    await waitFor(() => {
      expect(mockTeacherApi.createObjective).toHaveBeenCalledWith('c1', {
        title: 'New Task',
        description: 'Do something',
        checkKey: '',
      })
    })
  })

  it('shows built-in defaults hint when no objectives', async () => {
    mockTeacherApi.listObjectives.mockResolvedValue([])
    render(<ObjectivesManager classId="c1" />)

    await waitFor(() => {
      expect(screen.getByText(/using built-in defaults/)).toBeInTheDocument()
    })
  })
})
