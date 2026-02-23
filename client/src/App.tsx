import React, { useEffect, useState, useRef } from 'react'
import type { Todo, CharacterResponse } from 'shared'
import { startingPrompt } from './prompts'

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

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true


    console.log('Sending initial prompt to server:', startingPrompt);
    fetch('/api/story', {
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
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const res = await fetch('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        startingPrompt,
        {
          role: 'assistant',
          content: messageHistory.map((msg) => `${msg.name}: ${msg.response}`).join('\n')
        },
        { role: 'user', content: `Detective: ${text}` }
      ])
      // body: JSON.stringify({ text })
    })
    if (!res.ok) return
    const data = await res.json()
    console.log('Received response from server!!:', data);
    const parsedOutput: CharacterResponse[] = JSON.parse(data.output_text).responses;
    setMessageHistory((prev) => [...prev, ...parsedOutput])
    setText('')
  }

  return (
    <div className="app">
      <h1>Todos</h1>
      {/* {narratorOutput && <p className="narrator-output">{narratorOutput}</p>} */}
      
      <div className="message-history">
        <h2>Story</h2>
        {messageHistory.map((msg, idx) => (
          <div key={idx} className={`message message-${getRoleClass(msg.name)}`}>
            <p className="message-name">{msg.name}</p>
            <p className="message-response">{msg.response}</p>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add todo" />
        <button type="submit">Add</button>
      </form>
    </div>
  )
}
