# 🧠 LLM Orchestrator

Multi-model LLM task orchestrator with DAG-based decomposition, parallel execution, and **agentic code intelligence**.

## Features

- **Multi-Model Support**: Use any OpenAI-compatible API (OpenAI, Anthropic, Ollama, Groq, Together, etc.)
- **Intelligent Routing**: Auto-select models based on task complexity
- **DAG Decomposition**: Break complex tasks into subtasks with dependencies
- **Parallel Execution**: Run independent subtasks simultaneously
- **Domain Routing**: Specialized handlers for code, research, and writing tasks
- **Code Intelligence**: Agentic codebase exploration with persistent memory graph

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN ROUTER                              │
│  Detects: code | research | writing | general                  │
└─────────────────────────────┬───────────────────────────────────┘
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Code Intelligence│ │    Research     │ │    Writing      │
│                 │ │                 │ │                 │
│ • Memory Graph  │ │ • Web Search    │ │ • Outline Plan  │
│ • File Explorer │ │ • Multi-source  │ │ • Section Gen   │
│ • Caching       │ │ • Synthesis     │ │ • Tone Control  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              GENERAL DAG ORCHESTRATION                          │
│  (Falls back here for complex multi-step tasks)                │
│                                                                 │
│  Task → Decompose → Parallel Execute → Synthesize              │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/PriyeshWani/llm-orchestrator.git
cd llm-orchestrator
npm install
```

### 2. Configure Models

Edit `config/models.json` to enable your preferred models:

```json
{
  "models": {
    "ollama-gemma2": {
      "id": "ollama-gemma2",
      "name": "Gemma 2 (Local)",
      "endpoint": "http://localhost:11434/v1",
      "model": "gemma2:2b",
      "tier": "free",
      "capability": "moderate",
      "type": "local",
      "enabled": true
    }
  }
}
```

### 3. Run

```bash
# Point to your codebase for code intelligence
export REPO_PATH=/path/to/your/codebase

# Start the server
npm start

# Open http://localhost:3000
```

### 4. With Docker

```bash
docker compose up -d
```

## Code Intelligence

The code intelligence domain provides agentic codebase exploration:

### How It Works

1. **Request Classification**: Detects code-related questions
2. **Memory Check**: Looks for cached knowledge in the graph
3. **Exploration**: Scans directories, reads files, generates summaries
4. **Caching**: Stores knowledge for future queries
5. **Synthesis**: Combines cached + new knowledge to answer

### API Endpoints

```bash
# Ask about code
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"task": "Explain the authentication system"}'

# Search code memory
curl -X POST http://localhost:3000/api/code/search \
  -H "Content-Type: application/json" \
  -d '{"query": "auth"}'

# Get memory stats
curl http://localhost:3000/api/domains
```

### Memory Graph

Knowledge is persisted in `.code-memory/` in your repo:

```
.code-memory/
├── graph.json      # Nodes (files, functions, classes) and edges
└── summaries.json  # Cached file/module summaries
```

## Project Structure

```
src/
├── server.js              # Main HTTP server
├── core/
│   └── domain-router.js   # Routes to specialized domains
├── domains/
│   ├── code-intelligence/ # Codebase exploration + memory
│   ├── research/          # Web research + synthesis
│   └── writing/           # Long-form content generation
└── mcp/
    └── code-memory.js     # Persistent knowledge graph
```

## Domains

### Code Intelligence
**Triggers**: code, function, class, file, .js, .py, refactor, debug, explain

- Explores codebase structure
- Caches file summaries in memory graph
- Answers questions using cached + live exploration

### Research
**Triggers**: research, compare, statistics, news, find out

- Generates search queries
- Multi-source synthesis
- (Requires search API integration for web results)

### Writing
**Triggers**: write, draft, blog, email, edit, summarize

- Outline planning for long-form
- Section-by-section generation
- Tone and style control

## Configuration

### Environment Variables

```bash
PORT=3000                    # Server port
REPO_PATH=/path/to/code      # Codebase for code intelligence
CONFIG_PATH=./config/models.json
```

### Model Properties

| Property | Values | Description |
|----------|--------|-------------|
| `tier` | free, cheap, medium, expensive | Cost tier for routing |
| `speed` | fast, medium, slow | Response speed |
| `capability` | basic, moderate, advanced | Task complexity handling |
| `type` | local, cloud | For local-first routing |
| `enabled` | true, false | Enable/disable model |

### Routing Strategies

- **auto**: Select model based on task complexity
- **cheapest**: Prefer lower-cost models
- **quality**: Prefer most capable models
- **local-first**: Prefer local models, fallback to cloud

## API Reference

### POST /api/orchestrate
Start task orchestration with automatic domain routing.

```json
{
  "task": "Your task description",
  "strategy": "auto",
  "forceDomain": "code-intelligence"  // Optional: force specific domain
}
```

### GET /api/domains
Get registered domains and their stats.

### POST /api/code/search
Search the code memory graph.

### GET /api/health
Health check with model and domain info.

## Development

```bash
# Run with auto-reload
npm run dev

# Run tests
npm test
```

## License

MIT
