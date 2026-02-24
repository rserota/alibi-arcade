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

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
  // const [narratorOutput, setNarratorOutput] = useState('')
  const [messageHistory, setMessageHistory] = useState<CharacterResponse[]>([])
  const initialized = useRef(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

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
        const parsedOutput: CharacterResponse[] = JSON.parse(data.output_text).responses;
        console.log('parsed data', parsedOutput); 
        setMessageHistory((prev) => [...prev, ...parsedOutput])
      })
      .catch(console.error)
      .finally(() => setInitialLoading(false))
  }, [])

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
      const parsedOutput: CharacterResponse[] = JSON.parse(data.output_text).responses;
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
    </div>
  )
}
