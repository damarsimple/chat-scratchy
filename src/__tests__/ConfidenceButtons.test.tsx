import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfidenceButtons } from '../ConfidenceButtons'

const t = (key: string) => key

describe('ConfidenceButtons', () => {
  it('renders all three buttons', () => {
    render(<ConfidenceButtons onSignal={() => {}} currentSignal={null} t={t} />)
    expect(screen.getByText(/confused/)).toBeInTheDocument()
    expect(screen.getByText(/thinking/)).toBeInTheDocument()
    expect(screen.getByText(/got it/)).toBeInTheDocument()
  })

  it('calls onSignal when a button is clicked', async () => {
    const onSignal = vi.fn()
    const user = userEvent.setup()
    render(<ConfidenceButtons onSignal={onSignal} currentSignal={null} t={t} />)

    await user.click(screen.getByText(/confused/))
    expect(onSignal).toHaveBeenCalledWith('confused')
  })

  it('highlights the active signal', () => {
    render(<ConfidenceButtons onSignal={() => {}} currentSignal="confused" t={t} />)
    const confusedBtn = screen.getByText(/confused/).closest('button')
    expect(confusedBtn).toHaveClass('active')
  })

  it('does not highlight inactive signals', () => {
    render(<ConfidenceButtons onSignal={() => {}} currentSignal="good" t={t} />)
    const confusedBtn = screen.getByText(/confused/).closest('button')
    expect(confusedBtn).not.toHaveClass('active')
  })
})
