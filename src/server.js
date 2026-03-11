#!/usr/bin/env node
/**
 * LLM Orchestrator Server
 * Multi-model task decomposition with DAG-based parallel execution
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '../config/models.json');

// Load model configurations
let modelConfig = { models: {}, defaultModel: 'openai' };
try {
  if (fs.existsSync(CONFIG_PATH)) {
    modelConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    console.log(`✓ Loaded ${Object.keys(modelConfig.models).length} models from config`);
  }
} catch (e) {
  console.warn('⚠ Could not load model config:', e.message);
}

// Runtime model registry (can be updated via API)
const models = { ...modelConfig.models };

// Task state storage
const tasks = new Map();

// ============ COMPLEXITY SCORING ============

function scoreComplexity(text) {
  const t = text.toLowerCase();
  let score = Math.min(t.length / 100, 3);
  
  const high = ['analyze', 'synthesize', 'evaluate', 'design', 'architect', 'optimize', 'predict', 'compare', 'strategy', 'complex'];
  const medium = ['explain', 'describe', 'summarize', 'implement', 'create', 'develop', 'research'];
  const low = ['list', 'find', 'get', 'fetch', 'lookup', 'count', 'check', 'simple'];
  
  high.forEach(kw => { if (t.includes(kw)) score += 2; });
  medium.forEach(kw => { if (t.includes(kw)) score += 1; });
  low.forEach(kw => { if (t.includes(kw)) score -= 1; });
  
  const domains = ['machine learning', 'ai', 'algorithm', 'distributed', 'security', 'architecture'];
  domains.forEach(d => { if (t.includes(d)) score += 2; });
  
  score += (t.match(/,|and|&|\d\./g) || []).length * 0.5;
  
  return Math.max(0, Math.min(10, score));
}

function selectModel(complexity, strategy, availableModels) {
  const sorted = Object.values(availableModels)
    .filter(m => m.enabled !== false)
    .sort((a, b) => {
      if (strategy === 'cheapest' || strategy === 'local-first') {
        const tierOrder = { free: 0, cheap: 1, medium: 2, expensive: 3 };
        return (tierOrder[a.tier] || 2) - (tierOrder[b.tier] || 2);
      }
      if (strategy === 'fastest') {
        const speedOrder = { fast: 0, medium: 1, slow: 2 };
        return (speedOrder[a.speed] || 1) - (speedOrder[b.speed] || 1);
      }
      if (strategy === 'quality') {
        const capOrder = { advanced: 0, moderate: 1, basic: 2 };
        return (capOrder[a.capability] || 1) - (capOrder[b.capability] || 1);
      }
      return 0;
    });
  
  // Auto strategy: pick based on complexity
  if (strategy === 'auto') {
    if (complexity <= 3) return sorted.find(m => m.capability === 'basic') || sorted[0];
    if (complexity <= 6) return sorted.find(m => m.capability === 'moderate') || sorted[0];
    return sorted.find(m => m.capability === 'advanced') || sorted[0];
  }
  
  // Local-first: prefer local models
  if (strategy === 'local-first') {
    const local = sorted.find(m => m.type === 'local');
    if (local && complexity <= 6) return local;
  }
  
  return sorted[0];
}

// ============ DAG EXECUTION ============

function buildExecutionOrder(subtasks) {
  const levels = [];
  const completed = new Set();
  const remaining = [...subtasks];
  
  while (remaining.length > 0) {
    const level = [];
    const stillRemaining = [];
    
    for (const task of remaining) {
      const deps = task.dependsOn || [];
      if (deps.every(depId => completed.has(depId))) {
        level.push(task);
      } else {
        stillRemaining.push(task);
      }
    }
    
    if (level.length === 0 && stillRemaining.length > 0) {
      console.warn('Circular dependency detected');
      levels.push(stillRemaining);
      break;
    }
    
    level.forEach(t => completed.add(t.id));
    if (level.length > 0) levels.push(level);
    remaining.length = 0;
    remaining.push(...stillRemaining);
  }
  
  return levels;
}

async function callModel(model, messages, maxTokens = 500) {
  return new Promise((resolve, reject) => {
    const url = new URL(model.endpoint.replace(/\/$/, '') + '/chat/completions');
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? require('https') : http;
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add auth if configured
    if (model.apiKey) {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }
    
    const req = httpModule.request(url, {
      method: 'POST',
      headers,
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'API error'));
            return;
          }
          const content = response.choices?.[0]?.message?.content || '';
          const tokens = response.usage?.total_tokens || 0;
          resolve({ content, tokens });
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify({
      model: model.model,
      messages,
      max_tokens: maxTokens
    }));
    req.end();
  });
}

async function executeSubtask(subtask, taskContext, completedResults, models) {
  const model = models[subtask.modelId];
  if (!model) throw new Error(`Model not found: ${subtask.modelId}`);
  
  const contextFromDeps = (subtask.dependsOn || [])
    .map(depId => completedResults[depId])
    .filter(Boolean)
    .join('\n\n');
  
  const messages = [{
    role: 'user',
    content: `Complete this subtask concisely (max 150 words):

Main task: ${taskContext}
${contextFromDeps ? `\nContext from previous subtasks:\n${contextFromDeps}\n` : ''}
Subtask: ${subtask.name}`
  }];
  
  return callModel(model, messages, 400);
}

async function executeTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) return;
  
  const levels = buildExecutionOrder(task.subtasks);
  task.executionLevels = levels.map(l => l.map(t => t.id));
  const completedResults = {};
  let totalTokens = 0;
  
  for (const level of levels) {
    // Mark running
    level.forEach(st => {
      const t = task.subtasks.find(s => s.id === st.id);
      if (t) t.status = 'running';
    });
    
    // Execute in parallel
    const results = await Promise.allSettled(
      level.map(st => executeSubtask(st, task.task, completedResults, models))
    );
    
    results.forEach((result, idx) => {
      const st = task.subtasks.find(s => s.id === level[idx].id);
      if (result.status === 'fulfilled') {
        st.status = 'complete';
        st.result = result.value.content.slice(0, 300);
        st.tokens = result.value.tokens;
        totalTokens += result.value.tokens || 0;
        completedResults[st.id] = result.value.content;
      } else {
        st.status = 'error';
        st.result = result.reason?.message || 'Error';
      }
    });
  }
  
  task.complete = true;
  task.totalTokens = totalTokens;
}

// ============ HTTP SERVER ============

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = req.url.split('?')[0];
  
  // ===== API Routes =====
  
  // Health check
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', models: Object.keys(models).length }));
    return;
  }
  
  // List models
  if (url === '/api/models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models }));
    return;
  }
  
  // Add/update model
  if (url === '/api/models' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const model = JSON.parse(body);
        if (!model.id || !model.endpoint) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id and endpoint required' }));
          return;
        }
        models[model.id] = model;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, model }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Delete model
  if (url.startsWith('/api/models/') && req.method === 'DELETE') {
    const id = url.split('/').pop();
    delete models[id];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  
  // Start orchestration
  if (url === '/api/orchestrate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { task, orchestratorModelId, strategy } = JSON.parse(body);
        const taskId = `task-${Date.now()}`;
        const baseComplexity = scoreComplexity(task);
        
        // Select orchestrator model
        const orchestratorModel = models[orchestratorModelId] || Object.values(models)[0];
        if (!orchestratorModel) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No models configured' }));
          return;
        }
        
        // Decomposition prompt
        const decompPrompt = `You are a task decomposition agent. Break down this task into 3-7 subtasks.

Identify dependencies between subtasks. Respond with JSON only:
{
  "subtasks": [
    {"id": "s1", "name": "description", "dependsOn": [], "complexity": "low|medium|high"},
    {"id": "s2", "name": "description", "dependsOn": ["s1"], "complexity": "medium"}
  ]
}

Strategy: ${strategy}
Complexity: ${baseComplexity.toFixed(1)}/10
Task: ${task}`;

        const decomp = await callModel(orchestratorModel, [{ role: 'user', content: decompPrompt }], 1000);
        const jsonMatch = decomp.content.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse decomposition' }));
          return;
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        const subtasks = parsed.subtasks.map(st => {
          const complexity = { low: 2, medium: 5, high: 8 }[st.complexity] || 5;
          const selectedModel = selectModel(complexity, strategy, models);
          return {
            ...st,
            complexityScore: complexity,
            modelId: selectedModel?.id,
            modelName: selectedModel?.name,
            status: 'pending',
            result: null,
            tokens: 0
          };
        });
        
        const taskState = {
          task,
          strategy,
          subtasks,
          executionLevels: [],
          complete: false,
          startTime: Date.now(),
          baseComplexity
        };
        
        tasks.set(taskId, taskState);
        
        const levels = buildExecutionOrder(subtasks);
        taskState.executionLevels = levels.map(l => l.map(t => t.id));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          taskId,
          subtasks: taskState.subtasks,
          executionLevels: taskState.executionLevels,
          baseComplexity
        }));
        
        // Start execution
        executeTask(taskId);
        
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Get task status
  if (url.startsWith('/api/orchestrate/status/')) {
    const taskId = url.split('/').pop();
    const task = tasks.get(taskId);
    
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      subtasks: task.subtasks,
      executionLevels: task.executionLevels,
      complete: task.complete,
      totalTokens: task.totalTokens || 0,
      elapsed: Date.now() - task.startTime
    }));
    return;
  }
  
  // ===== Static Files =====
  let filePath = url === '/' ? '/index.html' : url;
  const fullPath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(fullPath);
  
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║       🧠 LLM Orchestrator v1.0.0          ║
╠═══════════════════════════════════════════╣
║  Server running at http://localhost:${PORT}  ║
║  Models loaded: ${Object.keys(models).length.toString().padEnd(24)}║
╚═══════════════════════════════════════════╝
  `);
});
