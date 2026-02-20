import React, { useEffect, useState } from 'react'
import type { Todo } from 'shared'
import { startingPrompt } from './prompts'
export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
  const [narratorOutput, setNarratorOutput] = useState('')

  useEffect(() => {
    fetch('/api/todos')
      .then((r) => r.json())
      .then(setTodos)
      .catch(console.error)

    fetch('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([startingPrompt])
    })
      .then((r) => r.json())
      .then((data) => { console.log(data); setNarratorOutput(data.output_text) })
      .catch(console.error)
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) return
    const todo = await res.json()
    setTodos((t) => [...t, todo])
    setText('')
  }

  return (
    <div className="app">
      <h1>Todos</h1>
      {narratorOutput && <p className="narrator-output">{narratorOutput}</p>}
      <form onSubmit={add} className="form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add todo" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  )
}
