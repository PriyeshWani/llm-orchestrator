/**
 * Writing Domain
 * Handles long-form content, editing, and creative writing
 */

class WritingDomain {
  constructor(options = {}) {
    this.callModel = options.callModel;
  }
  
  // Check if this domain should handle the request
  static matches(request) {
    const text = request.toLowerCase();
    const writingIndicators = [
      'write', 'draft', 'compose', 'create a', 'author',
      'blog post', 'article', 'essay', 'story', 'script',
      'email', 'letter', 'message', 'announcement',
      'edit', 'rewrite', 'improve', 'proofread', 'revise',
      'summarize', 'expand', 'shorten', 'paraphrase',
      'tone', 'style', 'formal', 'casual', 'professional',
      'outline', 'structure', 'introduction', 'conclusion'
    ];
    return writingIndicators.some(i => text.includes(i));
  }
  
  // Classify writing request
  classify(request) {
    const text = request.toLowerCase();
    
    let type = 'general';
    let format = 'prose';
    let length = 'medium';
    let tone = 'neutral';
    
    // Determine type
    if (text.includes('edit') || text.includes('rewrite') || text.includes('improve')) {
      type = 'editing';
    } else if (text.includes('summarize') || text.includes('shorten')) {
      type = 'summarization';
    } else if (text.includes('expand') || text.includes('elaborate')) {
      type = 'expansion';
    } else if (text.includes('blog') || text.includes('article') || text.includes('essay')) {
      type = 'long-form';
    } else if (text.includes('email') || text.includes('message')) {
      type = 'communication';
    } else if (text.includes('story') || text.includes('creative') || text.includes('fiction')) {
      type = 'creative';
    }
    
    // Determine format
    if (text.includes('bullet') || text.includes('list')) format = 'list';
    if (text.includes('outline')) format = 'outline';
    if (text.includes('script') || text.includes('dialogue')) format = 'script';
    
    // Determine length
    if (text.includes('brief') || text.includes('short') || text.includes('concise')) length = 'short';
    if (text.includes('detailed') || text.includes('comprehensive') || text.includes('long')) length = 'long';
    
    // Determine tone
    if (text.includes('formal') || text.includes('professional')) tone = 'formal';
    if (text.includes('casual') || text.includes('friendly') || text.includes('conversational')) tone = 'casual';
    if (text.includes('funny') || text.includes('humorous') || text.includes('witty')) tone = 'humorous';
    if (text.includes('persuasive') || text.includes('convincing')) tone = 'persuasive';
    
    return { type, format, length, tone };
  }
  
  // Generate writing plan for long-form content
  async generateOutline(request, classification, model) {
    if (!this.callModel || !model) return null;
    
    const response = await this.callModel(model, [{
      role: 'user',
      content: `Create a brief outline for this writing task:

Task: ${request}
Type: ${classification.type}
Format: ${classification.format}
Tone: ${classification.tone}

Provide 3-5 main sections with brief descriptions. JSON format:
{"sections": [{"title": "...", "description": "...", "wordCount": 100}]}`
    }], 400);
    
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch (e) {
      return null;
    }
  }
  
  // Write a section
  async writeSection(section, context, classification, model) {
    if (!this.callModel || !model) return '';
    
    const response = await this.callModel(model, [{
      role: 'user',
      content: `Write this section:

Title: ${section.title}
Description: ${section.description}
Target words: ~${section.wordCount}
Tone: ${classification.tone}
${context ? `\nContext from previous sections:\n${context}` : ''}

Write the section content:`
    }], section.wordCount * 2);
    
    return response.content;
  }
  
  // Main handler
  async handle(request, options = {}) {
    const startTime = Date.now();
    const classification = this.classify(request);
    const steps = [];
    
    steps.push({ type: 'classification', ...classification });
    
    const selectModel = options.selectModel;
    let result = null;
    
    // For long-form content, use outline + section approach
    if (classification.type === 'long-form' && classification.length !== 'short') {
      const plannerModel = selectModel ? selectModel(5) : null;
      
      // Generate outline
      const outline = await this.generateOutline(request, classification, plannerModel);
      if (outline) {
        steps.push({ type: 'outline_created', sections: outline.sections?.length || 0 });
        
        // Write each section
        const sections = [];
        let context = '';
        const writerModel = selectModel ? selectModel(6) : null;
        
        for (const section of (outline.sections || [])) {
          const content = await this.writeSection(section, context, classification, writerModel);
          sections.push({ title: section.title, content });
          context += `\n${section.title}: ${content.slice(0, 200)}...`;
          steps.push({ type: 'section_written', title: section.title });
        }
        
        // Combine sections
        result = sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
      }
    } else {
      // For shorter content, single-shot generation
      const model = selectModel ? selectModel(classification.length === 'short' ? 4 : 6) : null;
      
      if (model && this.callModel) {
        const lengthGuide = { short: '50-100', medium: '150-300', long: '400-600' }[classification.length];
        
        const response = await this.callModel(model, [{
          role: 'user',
          content: `${request}

Guidelines:
- Type: ${classification.type}
- Format: ${classification.format}
- Tone: ${classification.tone}
- Length: ~${lengthGuide} words

Write:`
        }], classification.length === 'long' ? 1000 : 500);
        
        result = response.content;
        steps.push({ type: 'generated', model: model.id });
      }
    }
    
    return {
      classification,
      steps,
      result,
      elapsed: Date.now() - startTime
    };
  }
}

module.exports = { WritingDomain };
