/**
 * Domain Router
 * Routes requests to specialized domain handlers
 */

const { CodeIntelligenceDomain } = require('../domains/code-intelligence');
const { ResearchDomain } = require('../domains/research');
const { WritingDomain } = require('../domains/writing');

class DomainRouter {
  constructor(options = {}) {
    this.domains = new Map();
    this.callModel = options.callModel;
    this.selectModel = options.selectModel;
    
    // Register built-in domains
    if (options.enableCodeIntelligence !== false) {
      this.register('code-intelligence', new CodeIntelligenceDomain({
        repoPath: options.repoPath || process.cwd(),
        memoryDir: options.memoryDir,
        callModel: this.callModel
      }));
    }
    
    if (options.enableResearch !== false) {
      this.register('research', new ResearchDomain({
        callModel: this.callModel,
        searchEndpoint: options.searchEndpoint
      }));
    }
    
    if (options.enableWriting !== false) {
      this.register('writing', new WritingDomain({
        callModel: this.callModel
      }));
    }
  }
  
  register(name, domain) {
    this.domains.set(name, domain);
  }
  
  // Detect which domain should handle the request
  detect(request) {
    // Check code intelligence first (most specific)
    if (CodeIntelligenceDomain.matches(request)) {
      return 'code-intelligence';
    }
    
    // Check writing domain
    if (WritingDomain.matches(request)) {
      return 'writing';
    }
    
    // Check research domain
    if (ResearchDomain.matches(request)) {
      return 'research';
    }
    
    return null; // No specialized domain - use general orchestration
  }
  
  // Route to appropriate domain
  async route(request, options = {}) {
    const domainName = this.detect(request);
    
    if (domainName && this.domains.has(domainName)) {
      const domain = this.domains.get(domainName);
      return {
        domain: domainName,
        result: await domain.handle(request, {
          selectModel: this.selectModel,
          ...options
        })
      };
    }
    
    return { domain: null, result: null };
  }
  
  // Get domain by name
  getDomain(name) {
    return this.domains.get(name);
  }
  
  // List registered domains
  listDomains() {
    return Array.from(this.domains.keys());
  }
  
  // Get stats from all domains
  getStats() {
    const stats = {};
    for (const [name, domain] of this.domains) {
      if (typeof domain.getStats === 'function') {
        stats[name] = domain.getStats();
      }
    }
    return stats;
  }
}

module.exports = { DomainRouter };
