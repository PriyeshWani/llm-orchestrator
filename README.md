# 🧠 LLM Orchestrator

Multi-model LLM task orchestrator with DAG-based decomposition and parallel execution.

![DAG Visualization](docs/dag-example.png)

## Features

- **Multi-Model Support**: Use any OpenAI-compatible API (OpenAI, Anthropic, Ollama, LM Studio, Groq, Together, etc.)
- **Intelligent Routing**: Auto-select models based on task complexity
- **DAG Decomposition**: Break complex tasks into subtasks with dependencies
- **Parallel Execution**: Run independent subtasks simultaneously
- **Real-time Visualization**: Watch execution progress in the browser
- **Complexity Scoring**: Automatic task complexity analysis
- **Cost Estimation**: Track token usage and estimated costs

## Quick Start

### Option 1: Node.js

```bash
# Clone and install
git clone <repo>
cd orchestrator
npm install

# Configure models
cp .env.example .env
# Edit .env with your API keys

# Start server
npm start
```

Open http://localhost:3000

### Option 2: Docker

```bash
# Build and run
docker compose up -d

# With Ollama included
docker compose --profile with-ollama up -d
```

### Option 3: With Local Models (Ollama)

```bash
# Install Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3
ollama pull mistral

# Start orchestrator (will auto-detect Ollama)
npm start
```

## Configuration

### Adding Models

Edit `config/models.json` or use the web UI (⚙️ Models button):

```json
{
  "models": {
    "my-local-model": {
      "id": "my-local-model",
      "name": "My Local LLM",
      "endpoint": "http://localhost:11434/v1",
      "model": "llama3",
      "tier": "free",
      "speed": "medium",
      "capability": "moderate",
      "type": "local",
      "enabled": true
    }
  }
}
```

### Model Properties

| Property | Values | Description |
|----------|--------|-------------|
| `tier` | free, cheap, medium, expensive | Cost tier for routing |
| `speed` | fast, medium, slow | Response speed |
| `capability` | basic, moderate, advanced | Task complexity handling |
| `type` | local, cloud | For local-first routing |

### Routing Strategies

- **Auto**: Select model based on task complexity
- **Cheapest First**: Prefer lower-cost models
- **Fastest**: Prefer faster models
- **Quality First**: Prefer most capable models
- **Local First**: Prefer local models, fallback to cloud

## API

### Start Orchestration

```bash
POST /api/orchestrate
{
  "task": "Your complex task description",
  "orchestratorModelId": "ollama-llama3",
  "strategy": "auto"
}
```

### Get Status

```bash
GET /api/orchestrate/status/{taskId}
```

### Manage Models

```bash
# List models
GET /api/models

# Add model
POST /api/models
{ "id": "...", "name": "...", "endpoint": "...", ... }

# Delete model
DELETE /api/models/{id}
```

## Architecture

```
┌─────────────────────────────────────┐
│         ORCHESTRATOR MODEL          │
│  (Decomposes task into subtasks)    │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌─────────┐         ┌─────────┐    Level 1 (parallel)
│   S1    │         │   S2    │
│ (local) │         │ (cloud) │
└────┬────┘         └────┬────┘
     └────────┬──────────┘
              ▼
        ┌─────────┐              Level 2
        │   S3    │
        │ (cloud) │
        └─────────┘
```

## Development

```bash
# Run with auto-reload
npm run dev

# Build Docker image
npm run docker:build
```

## License

MIT
