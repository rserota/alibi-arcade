import express from 'express'
import cors from 'cors'
import path from 'path'
import OpenAI from "openai";
const client = new OpenAI();

const app = express()
const PORT = process.env.PORT || 4000

import type { Todo } from 'shared'

// Define the response interface
interface ResponseItem {
  name: string
  response: string
}


app.use(cors())
app.use(express.json())

let todos: Todo[] = [
  { id: 1, text: 'Welcome to your full-stack app' }
]

// Example endpoint using OpenAI structured outputs
app.post('/api/story', async (req, res) => {
  console.log('Received request for new story with body:', req.body, typeof req.body);
  try {
    const response = await client.responses.create({
      // model: "gpt-5-mini",
      model: "gpt-5.2",
      input: req.body,
      text: {
        format: {
          type: "json_schema",
          name: "character_responses",
          schema: {
            type: "object",
            properties: {
              responses: {
                type: "array",
                minItems: 1,
                // maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    response: { type: "string" }
                  },
                  required: ["name", "response"],
                  additionalProperties: false
                }
              }
            },
            required: ["responses"],
            additionalProperties: false
          }
        }
      }
    });
    console.log('Generated story response:', response);
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
