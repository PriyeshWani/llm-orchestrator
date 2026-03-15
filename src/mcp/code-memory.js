/**
 * Code Memory Graph
 * Persistent knowledge storage for codebase understanding
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CodeMemoryGraph {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.graphPath = path.join(dataDir, 'graph.json');
    this.summariesPath = path.join(dataDir, 'summaries.json');
    
    this.graph = { nodes: {}, edges: [] };
    this.summaries = {};
    
    this.load();
  }
  
  load() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      if (fs.existsSync(this.graphPath)) {
        this.graph = JSON.parse(fs.readFileSync(this.graphPath, 'utf-8'));
      }
      if (fs.existsSync(this.summariesPath)) {
        this.summaries = JSON.parse(fs.readFileSync(this.summariesPath, 'utf-8'));
      }
    } catch (e) {
      console.error('Error loading graph:', e.message);
    }
  }
  
  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.graphPath, JSON.stringify(this.graph, null, 2));
    fs.writeFileSync(this.summariesPath, JSON.stringify(this.summaries, null, 2));
  }
  
  nodeId(type, identifier) {
    return `${type}:${crypto.createHash('md5').update(identifier).digest('hex').slice(0, 12)}`;
  }
  
  addNode(type, data) {
    const id = data.id || this.nodeId(type, data.path || data.name);
    this.graph.nodes[id] = { id, type, ...data, updatedAt: new Date().toISOString() };
    this.save();
    return id;
  }
  
  getNode(id) {
    return this.graph.nodes[id] || null;
  }
  
  queryNodes(type, filters = {}) {
    return Object.values(this.graph.nodes).filter(node => {
      if (type && node.type !== type) return false;
      for (const [key, value] of Object.entries(filters)) {
        if (key === 'path_contains' && node.path && !node.path.includes(value)) return false;
        if (key === 'name_contains' && node.name && !node.name.toLowerCase().includes(value.toLowerCase())) return false;
        if (key === 'has_summary' && value && !node.summary) return false;
      }
      return true;
    });
  }
  
  addEdge(fromId, toId, type, metadata = {}) {
    this.graph.edges = this.graph.edges.filter(
      e => !(e.from === fromId && e.to === toId && e.type === type)
    );
    this.graph.edges.push({ from: fromId, to: toId, type, ...metadata, createdAt: new Date().toISOString() });
    this.save();
  }
  
  getRelated(nodeId, edgeType = null, direction = 'both') {
    const related = [];
    for (const edge of this.graph.edges) {
      if (edgeType && edge.type !== edgeType) continue;
      if ((direction === 'out' || direction === 'both') && edge.from === nodeId) {
        const node = this.graph.nodes[edge.to];
        if (node) related.push({ node, edge, direction: 'out' });
      }
      if ((direction === 'in' || direction === 'both') && edge.to === nodeId) {
        const node = this.graph.nodes[edge.from];
        if (node) related.push({ node, edge, direction: 'in' });
      }
    }
    return related;
  }
  
  checkExplored(paths) {
    const explored = [], unexplored = [];
    for (const p of paths) {
      if (this.summaries[p] || Object.keys(this.summaries).some(k => k.startsWith(p))) {
        explored.push(p);
      } else {
        unexplored.push(p);
      }
    }
    return { explored, unexplored };
  }
  
  addSummary(filePath, summary, metadata = {}) {
    this.summaries[filePath] = { summary, ...metadata, updatedAt: new Date().toISOString() };
    this.save();
  }
  
  getSummary(filePath) {
    if (this.summaries[filePath]) return this.summaries[filePath];
    const matches = Object.entries(this.summaries)
      .filter(([p]) => p.startsWith(filePath) || filePath.startsWith(p))
      .map(([p, s]) => ({ path: p, ...s }));
    return matches.length > 0 ? matches : null;
  }
  
  addKnowledge({ nodes = [], edges = [], summaries = [] }) {
    for (const node of nodes) this.addNode(node.type, node.data);
    for (const edge of edges) this.addEdge(edge.from, edge.to, edge.type, edge.metadata);
    for (const s of summaries) this.addSummary(s.path, s.summary, s.metadata);
    return { added: nodes.length + edges.length + summaries.length };
  }
  
  searchText(query) {
    const q = query.toLowerCase();
    return Object.values(this.graph.nodes).filter(node =>
      (node.name && node.name.toLowerCase().includes(q)) ||
      (node.path && node.path.toLowerCase().includes(q)) ||
      (node.summary && node.summary.toLowerCase().includes(q))
    );
  }
  
  getStats() {
    return {
      nodes: Object.keys(this.graph.nodes).length,
      edges: this.graph.edges.length,
      summaries: Object.keys(this.summaries).length
    };
  }
}

module.exports = { CodeMemoryGraph };
