/**
 * Research Domain
 * Handles web research, information gathering, and synthesis
 */

const https = require('https');
const http = require('http');

class ResearchDomain {
  constructor(options = {}) {
    this.callModel = options.callModel;
    this.searchEndpoint = options.searchEndpoint; // Optional external search API
  }
  
  // Check if this domain should handle the request
  static matches(request) {
    const text = request.toLowerCase();
    const researchIndicators = [
      'research', 'find out', 'look up', 'search for', 'what is the latest',
      'news about', 'information about', 'learn about', 'discover',
      'compare', 'pros and cons', 'benefits of', 'how does', 'why does',
      'statistics', 'data on', 'studies show', 'according to',
      'market', 'trends', 'industry', 'competitors'
    ];
    return researchIndicators.some(i => text.includes(i));
  }
  
  // Classify research request
  classify(request) {
    const text = request.toLowerCase();
    
    let type = 'general';
    let depth = 'shallow';
    
    if (text.includes('compare') || text.includes('vs') || text.includes('versus')) {
      type = 'comparison';
      depth = 'deep';
    } else if (text.includes('how') || text.includes('why') || text.includes('explain')) {
      type = 'explanatory';
      depth = 'medium';
    } else if (text.includes('latest') || text.includes('news') || text.includes('recent')) {
      type = 'current-events';
      depth = 'shallow';
    } else if (text.includes('statistics') || text.includes('data') || text.includes('numbers')) {
      type = 'data-gathering';
      depth = 'deep';
    }
    
    // Extract topics
    const topics = this.extractTopics(text);
    
    return { type, depth, topics, requiresWeb: true };
  }
  
  extractTopics(text) {
    // Simple topic extraction - in production would use NER
    const stopwords = ['what', 'is', 'the', 'about', 'how', 'why', 'does', 'can', 'you', 'me', 'find', 'search', 'look', 'up', 'for', 'information', 'research'];
    const words = text.toLowerCase().split(/\s+/).filter(w => !stopwords.includes(w) && w.length > 2);
    return words.slice(0, 5);
  }
  
  // Generate research queries
  generateQueries(request, classification) {
    const queries = [request];
    
    if (classification.type === 'comparison') {
      // Extract items being compared and create individual queries
      const vsMatch = request.match(/(.+?)\s+(?:vs|versus|compared to|or)\s+(.+)/i);
      if (vsMatch) {
        queries.push(`${vsMatch[1]} features benefits`);
        queries.push(`${vsMatch[2]} features benefits`);
      }
    }
    
    if (classification.type === 'explanatory') {
      queries.push(`${classification.topics.join(' ')} explained simply`);
    }
    
    return queries;
  }
  
  // Simulate web search (in production, would use actual search API)
  async search(query) {
    // Placeholder - would integrate with Brave Search, SerpAPI, etc.
    return {
      query,
      results: [],
      note: 'Web search not configured - add searchEndpoint in config'
    };
  }
  
  // Main handler
  async handle(request, options = {}) {
    const startTime = Date.now();
    const classification = this.classify(request);
    const steps = [];
    
    steps.push({ type: 'classification', ...classification });
    
    // Generate research queries
    const queries = this.generateQueries(request, classification);
    steps.push({ type: 'queries_generated', queries });
    
    // If we have a search endpoint, use it
    let searchResults = [];
    if (this.searchEndpoint) {
      for (const q of queries.slice(0, 3)) {
        const result = await this.search(q);
        searchResults.push(result);
      }
      steps.push({ type: 'search_complete', resultsCount: searchResults.length });
    }
    
    // Synthesize response using LLM
    let result = null;
    if (options.selectModel && this.callModel) {
      const model = options.selectModel(classification.depth === 'deep' ? 7 : 4);
      
      const context = searchResults.length > 0 
        ? `Based on research:\n${JSON.stringify(searchResults, null, 2)}`
        : 'Note: No external search configured. Answering from model knowledge.';
      
      const response = await this.callModel(model, [{
        role: 'user',
        content: `${context}\n\nResearch request: ${request}\n\nProvide a well-structured research response with key findings:`
      }], 800);
      
      result = response.content;
      steps.push({ type: 'synthesis', model: model.id });
    }
    
    return {
      classification,
      steps,
      result,
      elapsed: Date.now() - startTime
    };
  }
}

module.exports = { ResearchDomain };
