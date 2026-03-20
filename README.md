# 🧠 LLM Orchestrator

Multi-model LLM orchestrator with DAG-based task decomposition and intelligent model routing.

Break down complex tasks into subtasks, route each to the optimal model (cheap/fast vs expensive/quality), execute in parallel where possible, and combine results.

![Orchestrator UI](https://img.shields.io/badge/UI-Interactive-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Task Decomposition** - Automatically breaks complex tasks into subtasks
- **DAG Execution** - Parallel execution with dependency management
- **Smart Routing** - Routes subtasks to optimal models based on complexity
- **Multi-Provider** - OpenAI, Anthropic, Ollama, Groq, Together, LM Studio
- **Visual DAG** - Interactive graph view of task execution
- **Workspace Integration** - Browse files, save outputs
- **Domain Routing** - Specialized handlers for code, research, writing

## Quick Start

### Option 1: Local (Ollama - Free)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma2:2b
ollama serve

# 2. Clone and run
git clone https://github.com/PriyeshWani/llm-orchestrator.git
cd llm-orchestrator
npm install
npm start

# 3. Open http://localhost:3000
```

### Option 2: With API Keys (Cloud Models)

```bash
git clone https://github.com/PriyeshWani/llm-orchestrator.git
cd llm-orchestrator
npm install

# Create .env file
cp .env.example .env
# Edit .env with your API keys

npm start
```

### Option 3: Docker

```bash
git clone https://github.com/PriyeshWani/llm-orchestrator.git
cd llm-orchestrator
docker build -t llm-orchestrator .
docker run -p 3000:3000 --env-file .env llm-orchestrator
```

## Configuration

### Model Configuration (`config/models.json`)

```json
{
  "models": {
    "ollama-gemma2": {
      "id": "ollama-gemma2",
      "name": "Gemma 2 (Ollama)",
      "endpoint": "http://localhost:11434/v1",
      "model": "gemma2:2b",
      "tier": "free",
      "speed": "fast",
      "capability": "moderate",
      "type": "local",
      "enabled": true
    },
    "anthropic-haiku": {
      "id": "anthropic-haiku",
      "name": "Claude Haiku",
      "endpoint": "https://api.anthropic.com/v1",
      "model": "claude-3-haiku-20240307",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "tier": "cheap",
      "speed": "fast",
      "capability": "basic",
      "type": "cloud",
      "enabled": true
    }
  },
  "defaultModel": "ollama-gemma2",
  "defaultStrategy": "auto"
}
```

### Model Properties

| Property | Values | Description |
|----------|--------|-------------|
| `tier` | `free`, `cheap`, `medium`, `expensive` | Cost tier for routing |
| `speed` | `fast`, `medium`, `slow` | Response speed |
| `capability` | `basic`, `moderate`, `advanced` | Task complexity handling |
| `type` | `local`, `cloud` | For local-first routing |

### Routing Strategies

- **auto** (default) - Routes based on task complexity
- **cheapest** - Prefer lowest cost models
- **quality** - Prefer highest capability models
- **fastest** - Prefer fastest response times
- **local-first** - Prefer local models, fallback to cloud

## Environment Variables

```bash
# API Keys (optional - only for cloud providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...

# Server config
PORT=3000
REPO_PATH=/path/to/your/project
```

## API Reference

### Start Orchestration
```bash
POST /api/orchestrate
{
  "task": "Write a REST API for user management",
  "strategy": "auto"
}
```

### Check Status
```bash
GET /api/orchestrate/status/{taskId}
```

### List Models
```bash
GET /api/models
```

### Add Model (Runtime)
```bash
POST /api/models
{
  "id": "my-model",
  "name": "My Model",
  "endpoint": "http://localhost:1234/v1",
  "model": "model-name",
  "enabled": true
}
```

### Health Check
```bash
GET /api/health
```

## How It Works

```
User: "Write a REST API for user management"
                    │
                    ▼
         ┌──────────────────┐
         │  Task Analysis   │
         │  Complexity: 7/10│
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  Decomposition   │
         │  (via LLM)       │
         └──────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │ S1     │  │ S2     │  │ S3     │
   │ Schema │  │ Routes │  │ Auth   │
   │ Haiku  │  │ Haiku  │  │ Sonnet │
   └────────┘  └────────┘  └────────┘
        │           │           │
        ▼           ▼           │
   ┌────────┐  ┌────────┐       │
   │ S4     │  │ S5     │       │
   │ CRUD   │  │ Valid  │◄──────┘
   │ Sonnet │  │ Haiku  │
   └────────┘  └────────┘
        │           │
        └─────┬─────┘
              ▼
         ┌────────┐
         │ S6     │
         │ Tests  │
         │ Opus   │
         └────────┘
              │
              ▼
      Combined Output
```

## Project Structure

```
llm-orchestrator/
├── src/
│   ├── server.js           # Main server
│   ├── public/
│   │   └── index.html      # Web UI
│   ├── core/
│   │   └── domain-router.js
│   └── domains/
│       ├── code-intelligence/
│       ├── research/
│       └── writing/
├── config/
│   └── models.json         # Model configuration
├── docker/
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Supported Providers

| Provider | Models | Free Tier |
|----------|--------|-----------|
| **Ollama** | Llama, Gemma, Mistral, etc. | ✅ Unlimited (local) |
| **LM Studio** | Any GGUF model | ✅ Unlimited (local) |
| **Groq** | Llama 3, Mixtral | ✅ Generous free tier |
| **Anthropic** | Claude Opus/Sonnet/Haiku | ❌ Paid only |
| **OpenAI** | GPT-4, GPT-3.5 | ❌ Paid only |
| **Together** | Many open models | ✅ Free credits |

## Development

```bash
# Watch mode
npm run dev

# Docker build
npm run docker:build

# Docker run
npm run docker:run
```

## License

MIT

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
