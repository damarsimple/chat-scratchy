import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatTranscript, parseThinkingBlocks, renderMarkdown } from '../ChatTranscript'
import type { ChatMessage } from '../api'

const t = (key: string) => key

describe('parseThinkingBlocks', () => {
  it('extracts thinking from <think> tags', () => {
    const result = parseThinkingBlocks('Some text <think>my thoughts</think> more text')
    expect(result.thinking).toBe('my thoughts')
    expect(result.content).toBe('Some text  more text')
  })

  it('extracts thinking from <thought> tags', () => {
    const result = parseThinkingBlocks('Hello <thought>internal</thought> world')
    expect(result.thinking).toBe('internal')
    expect(result.content).toBe('Hello  world')
  })

  it('handles no thinking blocks', () => {
    const result = parseThinkingBlocks('Just regular text')
    expect(result.thinking).toBe('')
    expect(result.content).toBe('Just regular text')
  })

  it('handles empty content', () => {
    const result = parseThinkingBlocks('')
    expect(result.thinking).toBe('')
    expect(result.content).toBe('')
  })
})

describe('renderMarkdown', () => {
  it('renders markdown to HTML', () => {
    const html = renderMarkdown('**bold** and *italic*')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('renders code blocks', () => {
    const html = renderMarkdown('`inline code`')
    expect(html).toContain('<code>inline code</code>')
  })
})

describe('ChatTranscript', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'assistant', content: '<think>I should greet them</think>Hello!' },
  ]

  it('renders user and assistant messages', () => {
    render(
      <ChatTranscript messages={messages} t={t} expandedThinking={new Set()} onToggleThinking={() => {}} />,
    )
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('renders thinking blocks as expandable sections', () => {
    render(
      <ChatTranscript messages={messages} t={t} expandedThinking={new Set()} onToggleThinking={() => {}} />,
    )
    expect(screen.getByText('▶ Thinking')).toBeInTheDocument()
  })

  it('expands thinking when clicked', () => {
    render(
      <ChatTranscript messages={messages} t={t} expandedThinking={new Set([2])} onToggleThinking={() => {}} />,
    )
    expect(screen.getByText('I should greet them')).toBeInTheDocument()
    expect(screen.getByText('▼ Thinking')).toBeInTheDocument()
  })

  it('calls onToggleThinking when thinking header is clicked', () => {
    const onToggle = vi.fn()
    render(
      <ChatTranscript messages={messages} t={t} expandedThinking={new Set()} onToggleThinking={onToggle} />,
    )
    screen.getByText('▶ Thinking').click()
    expect(onToggle).toHaveBeenCalledWith(2)
  })

  it('renders tool messages as action chips', () => {
    const toolMessages: ChatMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'highlight_block', arguments: '{"blockRef":"#ref1"}' } }] },
      { role: 'tool', tool_call_id: 'tc1', content: 'Highlighted #ref1' },
    ]
    render(
      <ChatTranscript messages={toolMessages} t={t} expandedThinking={new Set()} onToggleThinking={() => {}} />,
    )
    expect(screen.getByText('highlighted #ref1')).toBeInTheDocument()
  })

  it('hides assistant messages with only tool_calls and no content', () => {
    const toolOnly: ChatMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'get_scratch_context', arguments: '{}' } }] },
    ]
    const { container } = render(
      <ChatTranscript messages={toolOnly} t={t} expandedThinking={new Set()} onToggleThinking={() => {}} />,
    )
    expect(container.querySelectorAll('.message')).toHaveLength(0)
  })

  it('hides system messages', () => {
    const sysMsgs: ChatMessage[] = [
      { role: 'system', content: 'You are a tutor' },
      { role: 'user', content: 'Hi' },
    ]
    render(
      <ChatTranscript messages={sysMsgs} t={t} expandedThinking={new Set()} onToggleThinking={() => {}} />,
    )
    expect(screen.queryByText('You are a tutor')).not.toBeInTheDocument()
    expect(screen.getByText('Hi')).toBeInTheDocument()
  })
})
