import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActivityTracker } from '../useActivityTracker'

describe('useActivityTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with null timestamps', () => {
    const { result } = renderHook(() => useActivityTracker())
    expect(result.current.state.current.lastStudentMessageAt).toBeNull()
    expect(result.current.state.current.lastBlockChangeAt).toBeNull()
    expect(result.current.state.current.blockHistory).toHaveLength(0)
    expect(result.current.state.current.messageHistory).toHaveLength(0)
  })

  it('records student messages', () => {
    const { result } = renderHook(() => useActivityTracker())

    act(() => {
      result.current.recordStudentMessage('hello world')
    })

    expect(result.current.state.current.lastStudentMessageAt).toBeGreaterThan(0)
    expect(result.current.state.current.messageHistory).toHaveLength(1)
    expect(result.current.state.current.messageHistory[0].text).toBe('hello world')
  })

  it('tracks consecutive short messages', () => {
    const { result } = renderHook(() => useActivityTracker())

    act(() => {
      result.current.recordStudentMessage('hi')
    })
    expect(result.current.state.current.consecutiveShortMessages).toBe(1)

    act(() => {
      result.current.recordStudentMessage('hey')
    })
    expect(result.current.state.current.consecutiveShortMessages).toBe(2)

    act(() => {
      result.current.recordStudentMessage('a longer message that is not short')
    })
    expect(result.current.state.current.consecutiveShortMessages).toBe(0)
  })

  it('records block changes', () => {
    const { result } = renderHook(() => useActivityTracker())

    act(() => {
      result.current.recordBlockChange([{ id: '1', type: 'test', category: 'other', inputs: {}, children: [] }])
    })

    expect(result.current.state.current.lastBlockChangeAt).toBeGreaterThan(0)
    expect(result.current.state.current.blockHistory).toHaveLength(1)
  })

  it('limits block history to 5 entries', () => {
    const { result } = renderHook(() => useActivityTracker())

    for (let i = 0; i < 7; i++) {
      act(() => {
        result.current.recordBlockChange([{ id: String(i), type: 'test', category: 'other', inputs: {}, children: [] }])
      })
    }

    expect(result.current.state.current.blockHistory).toHaveLength(5)
  })

  it('records confidence signal', () => {
    const { result } = renderHook(() => useActivityTracker())

    act(() => {
      result.current.recordConfidenceSignal('confused')
    })

    expect(result.current.state.current.confidenceSignal).toBe('confused')
    expect(result.current.state.current.confidenceSignaledAt).toBeGreaterThan(0)
  })

  it('getStuckSeconds returns null when no activity', () => {
    const { result } = renderHook(() => useActivityTracker())
    expect(result.current.getStuckSeconds()).toBeNull()
  })

  it('getStuckSeconds returns seconds since last activity', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { result } = renderHook(() => useActivityTracker())

    act(() => {
      result.current.recordStudentMessage('hello')
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'))
    expect(result.current.getStuckSeconds()).toBe(30)
  })

  it('getEditVelocityDropped returns false when no history', () => {
    const { result } = renderHook(() => useActivityTracker())
    expect(result.current.getEditVelocityDropped()).toBe(false)
  })
})
