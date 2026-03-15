/**
 * Code Intelligence Domain
 * Handles code exploration, analysis, and knowledge caching
 */

const fs = require('fs');
const path = require('path');
const { CodeMemoryGraph } = require('../../mcp/code-memory');

class CodeIntelligenceDomain {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.memoryDir = options.memoryDir || path.join(this.repoPath, '.code-memory');
    this.memory = new CodeMemoryGraph(this.memoryDir);
    this.callModel = options.callModel; // Injected model caller
  }
  
  // Check if this domain should handle the request
  static matches(request) {
    const text = request.toLowerCase();
    const codeIndicators = [
      'code', 'function', 'class', 'module', 'file', 'import', 'export',
      'refactor', 'implement', 'debug', 'fix bug', 'add feature',
      'how does', 'explain the', 'codebase', 'repository', 'repo',
      '.js', '.ts', '.py', '.go', '.rs', '.java', '.rb', '.cpp',
      'src/', 'lib/', 'app/', 'components/', 'services/',
      'api', 'endpoint', 'controller', 'model', 'schema'
    ];
    return codeIndicators.some(i => text.includes(i));
  }
  
  // Classify the code request
  classify(request) {
    const text = request.toLowerCase();
    
    let scope = 'medium';
    let complexity = 5;
    
    // Scope indicators
    if (['what is', 'where is', 'find', 'show me', 'list'].some(i => text.includes(i))) {
      scope = 'small'; complexity = 2;
    }
    if (['refactor', 'redesign', 'migrate', 'implement'].some(i => text.includes(i))) {
      scope = 'large'; complexity = 8;
    }
    if (['architecture', 'design pattern', 'structure'].some(i => text.includes(i))) {
      scope = 'architectural'; complexity = 9;
    }
    
    // Extract likely paths
    const pathPatterns = text.match(/[\w\-\.\/]+\.(js|ts|py|go|rs|java|cpp|rb|php)/gi) || [];
    const dirPatterns = text.match(/(src|lib|app|components|services|utils|api|models)[\w\/]*/gi) || [];
    const likelyAreas = [...new Set([...pathPatterns, ...dirPatterns])];
    
    // Request type
    let type = 'question';
    if (text.includes('add') || text.includes('implement') || text.includes('create')) type = 'feature';
    if (text.includes('fix') || text.includes('bug') || text.includes('error')) type = 'debug';
    if (text.includes('refactor') || text.includes('improve')) type = 'refactor';
    if (text.includes('explain') || text.includes('how does')) type = 'explore';
    
    return { scope, type, complexity, likelyAreas, requiresExploration: scope !== 'small' || likelyAreas.length > 0 };
  }
  
  // Scan directory for code files
  scanDirectory(dirPath, depth = 2) {
    const results = [];
    const codeExts = ['.js', '.ts', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h'];
    
    const scan = (p, d) => {
      if (d > depth) return;
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(p, entry.name);
          const relativePath = path.relative(this.repoPath, fullPath);
          
          if (entry.isDirectory()) {
            results.push({ type: 'directory', path: relativePath });
            scan(fullPath, d + 1);
          } else if (entry.isFile() && codeExts.includes(path.extname(entry.name))) {
            results.push({ type: 'file', path: relativePath, size: fs.statSync(fullPath).size, language: path.extname(entry.name).slice(1) });
          }
        }
      } catch (e) {}
    };
    
    scan(dirPath, 0);
    return results;
  }
  
  // Read file content
  readFile(filePath, maxLines = 200) {
    try {
      const fullPath = path.join(this.repoPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
      }
      return content;
    } catch (e) {
      return null;
    }
  }
  
  // Explore an area and summarize files
  async exploreArea(area, model) {
    const files = this.scanDirectory(path.join(this.repoPath, area), 1);
    const codeFiles = files.filter(f => f.type === 'file').slice(0, 5);
    const summaries = [];
    
    for (const file of codeFiles) {
      const content = this.readFile(file.path);
      if (!content) continue;
      
      try {
        const response = await this.callModel(model, [{
          role: 'user',
          content: `Summarize this ${file.language} file concisely (2-3 sentences). What is its purpose?\n\nFile: ${file.path}\n\n\`\`\`${file.language}\n${content.slice(0, 3000)}\n\`\`\`\n\nSummary:`
        }], 150);
        
        summaries.push({ path: file.path, summary: response.content.trim(), language: file.language, size: file.size });
      } catch (e) {
        console.error(`Error summarizing ${file.path}:`, e.message);
      }
    }
    
    return { area, files: files.length, summaries };
  }
  
  // Main handler for code requests
  async handle(request, options = {}) {
    const startTime = Date.now();
    const classification = this.classify(request);
    const steps = [];
    
    // Check memory for cached knowledge
    let cachedContext = [];
    if (classification.likelyAreas.length > 0) {
      const memoryStatus = this.memory.checkExplored(classification.likelyAreas);
      steps.push({ type: 'cache_check', explored: memoryStatus.explored, unexplored: memoryStatus.unexplored });
      
      for (const p of memoryStatus.explored) {
        const summary = this.memory.getSummary(p);
        if (summary) cachedContext.push({ path: p, ...summary });
      }
      
      classification.likelyAreas = memoryStatus.unexplored;
    }
    
    // If simple with cache, answer directly
    if (!classification.requiresExploration && cachedContext.length > 0 && options.selectModel) {
      const model = options.selectModel(classification.complexity);
      const answer = await this.callModel(model, [{
        role: 'user',
        content: `Context from codebase:\n${cachedContext.map(c => `${c.path}: ${c.summary}`).join('\n')}\n\nQuestion: ${request}\n\nAnswer concisely:`
      }], 500);
      
      return { classification, steps, result: answer.content, elapsed: Date.now() - startTime, cached: true };
    }
    
    // Explore unknown areas
    if (classification.requiresExploration) {
      if (classification.likelyAreas.length === 0) {
        const repoStructure = this.scanDirectory(this.repoPath, 1);
        classification.likelyAreas = repoStructure.filter(f => f.type === 'directory').map(d => d.path).slice(0, 5);
      }
      
      steps.push({ type: 'exploration_plan', areas: classification.likelyAreas });
      
      const explorerModel = options.selectModel ? options.selectModel(3, 'cheapest') : null;
      const explorationResults = [];
      
      for (const area of classification.likelyAreas) {
        if (!explorerModel) break;
        steps.push({ type: 'exploring', area });
        const result = await this.exploreArea(area, explorerModel);
        explorationResults.push(result);
        
        // Save to memory
        this.memory.addKnowledge({
          summaries: result.summaries,
          nodes: result.summaries.map(s => ({ type: 'File', data: { path: s.path, summary: s.summary, language: s.language } }))
        });
      }
      
      steps.push({ type: 'exploration_complete', results: explorationResults.map(r => ({ area: r.area, files: r.files })) });
      
      // Synthesize
      const allSummaries = [...cachedContext, ...explorationResults.flatMap(r => r.summaries)];
      const synthModel = options.selectModel ? options.selectModel(classification.complexity) : null;
      
      if (synthModel && allSummaries.length > 0) {
        const answer = await this.callModel(synthModel, [{
          role: 'user',
          content: `Based on codebase exploration:\n\n${allSummaries.map(s => `**${s.path}**: ${s.summary}`).join('\n\n')}\n\nUser request: ${request}\n\nProvide a comprehensive response:`
        }], 1000);
        
        return { classification, steps, result: answer.content, elapsed: Date.now() - startTime };
      }
    }
    
    return { classification, steps, result: null, elapsed: Date.now() - startTime };
  }
  
  // Get memory stats
  getStats() {
    return this.memory.getStats();
  }
  
  // Search memory
  search(query) {
    return this.memory.searchText(query);
  }
}

module.exports = { CodeIntelligenceDomain };
