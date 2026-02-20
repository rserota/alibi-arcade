"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const openai_1 = __importDefault(require("openai"));
const client = new openai_1.default();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
let todos = [
    { id: 1, text: 'Welcome to your full-stack app' }
];
app.post('/api/story', async (req, res) => {
    console.log('Received request for new story with body:', req.body);
    try {
        const response = await client.responses.create({
            model: "gpt-5-mini",
            input: "Write a one-sentence bedtime story about a unicorn."
        });
        res.json(response);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate story' });
    }
});
app.get('/api/todos', (req, res) => {
    res.json(todos);
});
app.post('/api/todos', (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim())
        return res.status(400).json({ error: 'text required' });
    const id = todos.length ? todos[todos.length - 1].id + 1 : 1;
    const todo = { id, text: text.trim() };
    todos.push(todo);
    res.status(201).json(todo);
});
// Serve client build in production
if (process.env.NODE_ENV === 'production') {
    const clientDist = path_1.default.join(__dirname, '..', '..', 'client', 'dist');
    app.use(express_1.default.static(clientDist));
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(clientDist, 'index.html'));
    });
}
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
