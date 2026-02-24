import React, { useEffect, useState, useRef } from 'react'
import type { Todo, CharacterResponse } from 'shared'
import { startingPrompt } from './prompts'

const API_URL = import.meta.env.VITE_API_URL || ''

function getRoleClass(characterName: string): string {
  const name = characterName.toLowerCase()
  if (name.includes('oroner')) return 'coroner'
  if (name === 'player' || name === 'detective') return 'player'
  if (name.includes('suspect') && name.includes('1')) return 'suspect-1'
  if (name.includes('suspect') && name.includes('2')) return 'suspect-2'
  if (name.includes('suspect') && name.includes('3')) return 'suspect-3'
  return 'character'
}

// Extract a single JSON value from noisy text. Returns parsed object or throws.
function extractJson(maybeJson: any): any {
  if (maybeJson == null) throw new Error('No input')
  if (typeof maybeJson !== 'string') return maybeJson

  const text: string = maybeJson

  // Fast path
  try {
    return JSON.parse(text)
  } catch (e) {
    // continue to scanner
  }

  // Find start of JSON (object or array)
  const firstBrace = text.indexOf('{')
  const firstBracket = text.indexOf('[')
  let start = -1
  if (firstBrace === -1) start = firstBracket
  else if (firstBracket === -1) start = firstBrace
  else start = Math.min(firstBrace, firstBracket)
  if (start === -1) throw new Error('No JSON start found')

  // Scan forward, tracking nesting, respecting strings and escapes
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        try { return JSON.parse(candidate) } catch (e) { /* keep scanning */ }
      }
    }
  }
  throw new Error('Could not extract valid JSON')
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
  // const [narratorOutput, setNarratorOutput] = useState('')
  const [messageHistory, setMessageHistory] = useState<CharacterResponse[]>([])
  const initialized = useRef(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true


    console.log('Sending initial prompt to server:', startingPrompt);
    fetch(`${API_URL}/api/story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([startingPrompt])
    })
      .then((r) => r.json())
      .then((data) => { 
        console.log('data', data); 
        let parsed: any
        try {
          parsed = extractJson(data.output_text)
        } catch (err) {
          console.error('Failed to parse model output', err, data.output_text)
          return
        }
        const parsedOutput: CharacterResponse[] = parsed?.responses ?? []
        console.log('parsed data', parsedOutput); 
        setMessageHistory((prev) => [...prev, ...parsedOutput])
      })
      .catch(console.error)
      .finally(() => setInitialLoading(false))
  }, [])

  // Enable auto-scroll once messageHistory has initial content
  useEffect(() => {
    if (!autoScroll && messageHistory.length > 0) {
      setAutoScroll(true)
    }
  }, [messageHistory, autoScroll])

  // Keep viewport scrolled to bottom when messageHistory changes, only if autoScroll enabled
  useEffect(() => {
    if (!autoScroll) return
    if (bottomRef.current) {
      try {
        bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } catch (e) {
        bottomRef.current.scrollIntoView()
      }
    }
  }, [messageHistory])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    // Build the user's message and a new history synchronously so we can
    // use it immediately when composing the request body (avoids race).
    const userMessage: CharacterResponse = { name: 'Detective', response: text }
    const newHistory = [...messageHistory, userMessage]
    setMessageHistory(newHistory)
    const userText = text
    setText('')
    setIsSending(true)

    try {
      const res = await fetch(`${API_URL}/api/story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          startingPrompt,
          {
            role: 'assistant',
            content: newHistory.map((msg) => `${msg.name}: ${msg.response}`).join('\n')
          },
          { role: 'user', content: `Detective: ${userText}` }
        ])
      })

      if (!res.ok) return
      const data = await res.json()
      console.log('Received response from server!!:', data);
      let parsed: any
      try {
        parsed = extractJson(data.output_text)
      } catch (err) {
        console.error('Failed to parse model output', err, data.output_text)
        return
      }
      const parsedOutput: CharacterResponse[] = parsed?.responses ?? []
      setMessageHistory((prev) => [...prev, ...parsedOutput])
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="loading-center">
        <div className="spinner large">?</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="message-history">
        {messageHistory.map((msg, idx) => (
          <div key={idx} className={`message message-${getRoleClass(msg.name)}`}>
            <p className="message-name">{msg.name}</p>
            <p className="message-response">{msg.response}</p>
          </div>
        ))}
      </div>

      {isSending && (
        <div className="small-spinner-wrapper">
          <div className="spinner small">?</div>
        </div>
      )}

      <form onSubmit={add} className="form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question about the story" />
        <button type="submit">Ask</button>
      </form>
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  )
}
