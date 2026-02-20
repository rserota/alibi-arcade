export type Todo = {
    id: number;
    text: string;
};
export type message = {
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string;
};
