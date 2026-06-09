import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timeline } from '../../teacher/Timeline'
import type { ActivityEvent, Intervention } from '../../api'

describe('Timeline', () => {
  it('shows empty state when no items', () => {
    render(<Timeline interventions={[]} events={[]} />)
    expect(screen.getByText(/No activity recorded/)).toBeInTheDocument()
  })

  it('renders interventions', () => {
    const interventions: Intervention[] = [
      {
        id: 'i1',
        patternId: 'no_start_block',
        message: 'Try adding a start block',
        outcome: 'helped',
        createdAt: '2026-06-01T10:00:00Z',
      },
    ]
    render(<Timeline interventions={interventions} events={[]} />)
    expect(screen.getByText('Try adding a start block')).toBeInTheDocument()
    expect(screen.getByText('helped')).toBeInTheDocument()
  })

  it('renders activity events', () => {
    const events: ActivityEvent[] = [
      {
        id: 'e1',
        type: 'confidence',
        payload: { signal: 'confused' },
        createdAt: '2026-06-01T10:01:00Z',
      },
      {
        id: 'e2',
        type: 'run',
        payload: {},
        createdAt: '2026-06-01T10:02:00Z',
      },
    ]
    render(<Timeline interventions={[]} events={events} />)
    expect(screen.getByText(/confidence/)).toBeInTheDocument()
    expect(screen.getByText(/run/)).toBeInTheDocument()
  })

  it('sorts items chronologically', () => {
    const interventions: Intervention[] = [
      { id: 'i1', patternId: null, message: 'Later hint', outcome: null, createdAt: '2026-06-01T10:02:00Z' },
    ]
    const events: ActivityEvent[] = [
      { id: 'e1', type: 'student_message', payload: {}, createdAt: '2026-06-01T10:00:00Z' },
    ]
    render(<Timeline interventions={interventions} events={events} />)

    const items = screen.getAllByText(/student_message|Later hint/)
    expect(items[0].textContent).toMatch(/student_message/)
    expect(items[1].textContent).toMatch(/Later hint/)
  })
})
