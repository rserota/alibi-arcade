// Plain TypeScript DTOs shared between client and server
export type Todo = {
  id: number
  text: string
}

export type message = {
  role: 'user' | 'assistant' | 'system' | 'developer'
  content: string
}

export type CharacterResponse = { name: string; response: string }