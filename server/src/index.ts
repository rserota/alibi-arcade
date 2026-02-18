import express from 'express'
import cors from 'cors'
import path from 'path'
import OpenAI from "openai";
const client = new OpenAI();



const app = express()
const PORT = process.env.PORT || 4000

import type { Todo } from 'shared'

app.use(cors())
app.use(express.json())

let todos: Todo[] = [
  { id: 1, text: 'Welcome to your full-stack app' }
]

app.get('/api/new-story', async (req, res) => {
    try {
        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: "Write a one-sentence bedtime story about a unicorn."
        });
        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate story' });
    }
});

app.get('/api/todos', (req, res) => {
  res.json(todos)
})

app.post('/api/todos', (req, res) => {
  const { text } = req.body as { text?: string }
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })
  const id = todos.length ? todos[todos.length - 1].id + 1 : 1
  const todo: Todo = { id, text: text.trim() }
  todos.push(todo)
  res.status(201).json(todo)
})

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
