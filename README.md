# LinkedIn Hooks Studio

A lightweight web app that turns a boring statement into 5 stronger LinkedIn hooks using a local Ollama model.

## Run it

1. Copy `.env.example` to `.env`
2. Make sure Ollama is running
3. Make sure the model in `.env` is installed, for example:

```bash
ollama pull llama3.2:1b
```

4. Start the app:

```bash
npm start
```

Then open `http://localhost:3000`.

## Configuration

The app supports these environment variables:

- `OLLAMA_HOST` - defaults to `http://127.0.0.1:11434`
- `OLLAMA_MODEL` - defaults to `llama3.2:1b`
- `PORT` - defaults to `3000`

## Notes

- The server calls Ollama's local `/api/chat` endpoint and requests structured JSON so the frontend reliably receives exactly 5 hooks.
- The frontend is plain HTML, CSS, and JavaScript, so there are no dependencies to install.
# linkedin-posts
