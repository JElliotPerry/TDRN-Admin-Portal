/**
 * TDRN AI Engine — ai-engine.js
 * AGI-Powered Disaster Response Intelligence
 * Thrive Disaster Response Network | Version 2.0.0
 *
 * SETUP INSTRUCTIONS:
 * 1. Obtain an OpenAI API key from https://platform.openai.com/api-keys
 * 2. Set your key via: TDRNai.configure('sk-your-key-here')
 *    OR set window.TDRN_AI_KEY before this script loads
 * 3. Include this file after tdrn-core.js:
 *    <script src="ai-engine.js"></script>
 * 4. Call TDRNai.configure(key) on page load before using any methods
 *
 * SECURITY NOTE:
 * For production, never expose your API key in client-side code.
 * Route requests through a serverless function or Supabase Edge Function.
 * Use TDRNai.configure(key, 'https://your-proxy.com/api/ai') to point at a proxy.
 */

// =============================================================================
// 1. CONFIGURATION
// =============================================================================

const TDRNai = {
  _config: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model:    'gpt-4o',
    key:      window.TDRN_AI_KEY || '',  // Set window.TDRN_AI_KEY before loading this file
    timeout:  30000,
    maxRetries: 2,
  },

  // Token usage tracking
  usage: {
    tokensIn:  0,
    tokensOut: 0,
    requests:  0,
    errors:    0,
    get estimatedCost() {
      // GPT-4o pricing (approximate): $5/1M input, $15/1M output
      return ((TDRNai.usage.tokensIn / 1e6) * 5) + ((TDRNai.usage.tokensOut / 1e6) * 15);
    }
  },

  /**
   * Configure the AI engine at runtime
   * @param {string} key       - OpenAI API key
   * @param {string} endpoint  - API endpoint (default: OpenAI)
   * @param {string} model     - Model ID (default: gpt-4o)
   */
  configure(key, endpoint, model) {
    if (key)      this._config.key      = key;
    if (endpoint) this._config.endpoint = endpoint;
    if (model)    this._config.model    = model;
    console.log('[TDRNai] Configured. Model:', this._config.model);
  },

  // ---------------------------------------------------------------------------
  // CORE REQUEST — all AI methods funnel through here
  // ---------------------------------------------------------------------------
  async _request(messages, options = {}) {
    if (!this._config.key) {
      console.warn('[TDRNai] No API key set. Returning demo response.');
      return this._demoResponse(messages, options);
    }

    let attempt = 0;
    while (attempt <= this._config.maxRetries) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._config.timeout);

        const res = await fetch(this._config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this._config.key}`
          },
          body: JSON.stringify({
            model:       options.model || this._config.model,
            messages,
            temperature: options.temperature ?? 0.3,
            max_tokens:  options.maxTokens  ?? 1200,
            ...(options.responseFormat ? { response_format: options.responseFormat } : {})
          }),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 429 && attempt < this._config.maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            attempt++;
            continue;
          }
          this.usage.errors++;
          return { success: false, data: null, error: err.error?.message || `HTTP ${res.status}` };
        }

        const json = await res.json();
        this.usage.tokensIn  += json.usage?.prompt_tokens     || 0;
        this.usage.tokensOut += json.usage?.completion_tokens || 0;
        this.usage.requests++;

        const text = json.choices?.[0]?.message?.content || '';
        return { success: true, data: text, error: null };

      } catch (e) {
        if (e.name === 'AbortError') {
          this.usage.errors++;
          return { success: false, data: null, error: 'Request timed out' };
        }
        attempt++;
        if (attempt > this._config.maxRetries) {
          this.usage.errors++;
          return { success: false, data: null, error: e.message };
        }
      }
    }
  },

  // Demo mode — returns plausible mock responses when no API key is set
  _demoResponse(messages, options) {
    const last = messages[messages.length - 1]?.content || '';
    const demos = [
      { match: /incident|analyze/i, data: JSON.stringify({ incidentType: 'Tornado', severity: 4, recommendedTeams: ['Team Alpha', 'Team Bravo'], recommendedEquipment: ['Skid Steer', 'Chainsaw Crew'], estimatedPersonnel: 24, priorityActions: ['Establish ICS structure', 'Deploy to sector A', 'Open shelter at Civic Center'], icsLevel: 3 }) },
      { match: /ics-?209|status summary/i, data: 'ICS-209 INCIDENT STATUS SUMMARY\n\nIncident Name: Warren County Tornado Response\nIncident Number: 2026-TN-WC-001\nDate/Time: May 2, 2026 / 14:00 CST\nIncident Commander: Capt. R. Morgan\n\nSituation Summary: EF-2 tornado touched down 0312 hours. 3 residential structures destroyed, 14 damaged. Zero fatalities. 2 minor injuries treated on scene. Primary debris field in eastern sector along Hwy 70S corridor. All clear issued for populated areas.\n\nResources Assigned: 8 teams / 142 personnel / 23 equipment units\nEstimated Containment: 90%\nETA Full Recovery: 72 hours' },
      { match: /certif|expir/i, data: '12 certifications expiring within 30 days:\n- 4x First Aid/CPR: Johnson, Martinez, Chen, Williams (May 28–31)\n- 3x ICS-200: Davis, Thompson, Garcia (June 2–8)\n- 5x Chainsaw Safety: Miller, Brown, Wilson, Moore, Taylor (June 10–15)\n\nRecommendation: Schedule refresher training week of May 19. I can draft a training announcement if needed.' },
    ];
    const match = demos.find(d => d.match.test(last));
    return Promise.resolve({ success: true, data: match?.data || 'Demo mode active. Configure an API key via TDRNai.configure(key) to enable live AI responses.', error: null });
  },

  // Shared system prompt injected into every request for context
  _systemPrompt() {
    return `You are ARIA (Automated Response Intelligence Assistant), the AI brain of the TDRN (Thrive Disaster Response Network) portal. You help coordinators make fast, accurate decisions during disaster response. You know TDRN's structure, ICS protocols, the Warren County Tennessee deployment, and all member and equipment data. Warren County currently has 142 members, 8 teams, 23 equipment units, and an active tornado response incident at ICS Type 3. Be concise, action-oriented, and use emergency management terminology. Always prioritize life safety. Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  },

  _parseJSON(text) {
    try {
      const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/({[\s\S]*})/);
      return JSON.parse(match ? match[1] : text);
    } catch { return null; }
  },


  // =============================================================================
  // 2. SMART DISPATCH ENGINE
  // =============================================================================
  dispatch: {

    /**
     * Analyze an incident description and return structured deployment recommendations.
     * @param {string} description - Freeform incident description
     * @returns {{ incidentType, severity, recommendedTeams[], recommendedEquipment[], estimatedPersonnel, priorityActions[], icsLevel }}
     */
    async analyzeIncident(description) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Analyze this incident and return a JSON object with these exact keys: incidentType (string), severity (integer 1-5), recommendedTeams (array of strings), recommendedEquipment (array of strings), estimatedPersonnel (integer), priorityActions (array of 3-5 action strings), icsLevel (integer 1-5).\n\nIncident: ${description}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 600 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Match available volunteers to a set of requirements.
     * @param {{ skills: string[], certs: string[], count: number }} requirements
     */
    async matchVolunteers(requirements) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Given these requirements: ${JSON.stringify(requirements)}, return a ranked JSON array of up to 10 member recommendations. Each item: { name, role, skills, matchScore (0-100), reason }.` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 800 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Suggest optimal team assignments for an incident.
     * @param {object[]} teams    - Array of team objects
     * @param {object}   incident - Incident object
     */
    async optimizeDeployment(teams, incident) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Optimize team deployment. Teams: ${JSON.stringify(teams)}. Incident: ${JSON.stringify(incident)}. Return JSON: { assignments: [{ teamName, sector, mission, priority }], stagingArea, communicationsFrequency, safetyNotes }` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 800 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Estimate response timeline phases for an incident type and resource set.
     * @param {string}   incidentType
     * @param {object}   resources    - { teams, equipment, personnel }
     */
    async estimateTimeline(incidentType, resources) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Estimate timeline phases for a ${incidentType} response with resources: ${JSON.stringify(resources)}. Return JSON array of phases: [{ phase, estimatedHours, description, milestone }]` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 600 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    }
  },


  // =============================================================================
  // 3. NATURAL LANGUAGE REPORTING
  // =============================================================================
  reporting: {

    /**
     * Parse a freeform field report into structured ICS-compatible JSON.
     * @param {string} text - Raw field report text
     */
    async parseFieldReport(text) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Parse this field report into structured JSON: { reporter, team, location, timestamp, incidentType, situationSummary, resourcesNeeded, casualties, recommendations, urgencyLevel (1-5) }.\n\nReport: ${text}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 700 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Generate a complete ICS report from incident data.
     * @param {object} incidentData - Incident object with teams, equipment, logs
     * @param {'ICS-201'|'ICS-204'|'ICS-209'} reportType
     */
    async generateICSReport(incidentData, reportType = 'ICS-209') {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Generate a complete, properly formatted ${reportType} report based on this data: ${JSON.stringify(incidentData)}. Include all standard ICS form sections. Use formal emergency management language.` }
      ], { maxTokens: 1500 });

      return res;
    },

    /**
     * Generate an After Action Report from incident data and logs.
     * @param {string}   incidentId
     * @param {object[]} logs - Incident log entries
     */
    async generateAfterActionReport(incidentId, logs) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Generate a comprehensive After Action Report (AAR) for incident ${incidentId}. Logs: ${JSON.stringify(logs)}. Include: Executive Summary, Timeline of Events, What Worked Well, Areas for Improvement, Lessons Learned, Recommendations, Corrective Action Plan.` }
      ], { maxTokens: 2000 });

      return res;
    },

    /**
     * Create an executive summary from an activity feed.
     * @param {object[]} activityFeed - Array of activity items
     */
    async summarizeActivity(activityFeed) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Summarize this activity feed in 3-4 concise bullet points suitable for an executive briefing: ${JSON.stringify(activityFeed)}` }
      ], { maxTokens: 400 });

      return res;
    },

    /**
     * Transcribe and parse audio (requires audio Blob).
     * Requires OpenAI Whisper endpoint — separate from chat completions.
     * @param {Blob} audioBlob
     */
    async transcribeAndParse(audioBlob) {
      if (!TDRNai._config.key) return { success: false, data: null, error: 'API key required for transcription' };
      try {
        const form = new FormData();
        form.append('file', audioBlob, 'report.webm');
        form.append('model', 'whisper-1');
        form.append('language', 'en');

        const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${TDRNai._config.key}` },
          body: form
        });
        const { text } = await transcribeRes.json();
        if (!text) return { success: false, data: null, error: 'Transcription failed' };

        return TDRNai.reporting.parseFieldReport(text);
      } catch (e) {
        return { success: false, data: null, error: e.message };
      }
    }
  },


  // =============================================================================
  // 4. PREDICTIVE ANALYTICS
  // =============================================================================
  predictive: {

    /**
     * Identify upcoming compliance gaps before they occur.
     * @param {object[]} memberData - Member records with cert data
     * @param {object[]} certData   - Certification records
     */
    async predictReadinessGaps(memberData, certData) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Analyze member data and certification records to predict upcoming readiness gaps. Return JSON: { gaps: [{ type, severity (1-5), affectedMembers, timeframe, recommendedAction }], overallRiskScore (1-100) }.\nMember data: ${JSON.stringify(memberData).slice(0, 2000)}\nCert data: ${JSON.stringify(certData).slice(0, 2000)}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 800 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Recommend training priorities based on member data and incident history.
     * @param {object[]} memberData
     * @param {object[]} incidentHistory
     */
    async forecastTrainingNeeds(memberData, incidentHistory) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Based on member skills and incident history, forecast training needs. Return JSON array: [{ trainingType, priority (1-5), rationale, estimatedParticipants, suggestedDate }].\nHistory: ${JSON.stringify(incidentHistory).slice(0, 1500)}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 700 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Assess risk score for a county based on current conditions.
     * @param {object} weatherData
     * @param {object} historicalData
     * @param {string} location
     */
    async assessRisk(weatherData, historicalData, location) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Assess current risk for ${location}. Weather: ${JSON.stringify(weatherData)}. Historical: ${JSON.stringify(historicalData)}. Return JSON: { riskScore (1-100), primaryHazards: [], timeframe, confidence (0-1), recommendations: [] }` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 600 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Flag equipment due for maintenance based on usage and inspection data.
     * @param {object[]} equipmentData
     */
    async predictEquipmentMaintenance(equipmentData) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Analyze equipment records and flag items due for maintenance. Return JSON array: [{ itemName, urgency (critical|soon|monitor), reason, recommendedDate, estimatedDowntime }].\nEquipment: ${JSON.stringify(equipmentData).slice(0, 2000)}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 700 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    }
  },


  // =============================================================================
  // 5. COMMUNICATIONS INTELLIGENCE
  // =============================================================================
  comms: {

    /**
     * Triage an incoming message for priority and action type.
     * @param {string} message
     * @returns {{ type, priority (1-5), requiresAction, suggestedResponse }}
     */
    async triageMessage(message) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Triage this message and return JSON: { type (field_report|alert|status_update|request|general), priority (1-5), requiresAction (boolean), suggestedResponse (string, max 80 words), tags: [] }.\nMessage: ${message}` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 400 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Draft an emergency alert message.
     * @param {string} situation
     * @param {string} audience    - e.g. 'all_members', 'team_leaders', 'public'
     * @param {number} urgency     - 1-5
     */
    async draftAlert(situation, audience, urgency) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Draft an emergency alert for the following situation. Audience: ${audience}. Urgency level: ${urgency}/5. Keep it under 160 characters for SMS compatibility. Also provide a longer email version.\n\nSituation: ${situation}\n\nReturn JSON: { smsVersion (string), emailVersion (string), subject (string) }` }
      ], { responseFormat: { type: 'json_object' }, maxTokens: 500 });

      if (!res.success) return res;
      return { success: true, data: TDRNai._parseJSON(res.data) || res.data, error: null };
    },

    /**
     * Translate ICS/emergency jargon to plain English for public communication.
     * @param {string} text
     * @param {string} targetAudience - e.g. 'public', 'media', 'volunteers'
     */
    async translateJargon(text, targetAudience = 'public') {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Translate this emergency management text into plain English for ${targetAudience}. Keep all critical safety information intact. Remove jargon and acronyms or explain them.\n\nOriginal: ${text}` }
      ], { maxTokens: 600 });

      return res;
    },

    /**
     * Suggest a reply to a field report.
     * @param {string} message - Incoming message
     * @param {object} context - Additional context (incident status, resources, etc.)
     */
    async suggestResponse(message, context = {}) {
      const res = await TDRNai._request([
        { role: 'system', content: TDRNai._systemPrompt() },
        { role: 'user',   content: `Suggest a concise, action-oriented response to this field message. Be specific. Context: ${JSON.stringify(context)}.\n\nField message: ${message}` }
      ], { maxTokens: 300 });

      return res;
    }
  },


  // =============================================================================
  // 6. ARIA CHAT INTERFACE
  // =============================================================================
  chat: {
    history: [],
    _minimized: false,
    _container: null,

    /**
     * Send a message to ARIA and get a response.
     * @param {string} message - User message
     * @param {object} context - Optional additional context
     */
    async send(message, context = {}) {
      this.history.push({ role: 'user', content: message });

      const messages = [
        { role: 'system', content: TDRNai._systemPrompt() + (Object.keys(context).length ? `\nAdditional context: ${JSON.stringify(context)}` : '') },
        ...this.history.slice(-20) // Keep last 20 messages for context window management
      ];

      const res = await TDRNai._request(messages, { maxTokens: 800, temperature: 0.4 });

      if (res.success) {
        this.history.push({ role: 'assistant', content: res.data });
      } else {
        this.history.push({ role: 'assistant', content: `⚠ ARIA error: ${res.error}` });
      }

      return res;
    },

    /** Clear conversation history */
    clear() {
      this.history = [];
      const chatMessages = this._container?.querySelector('.aria-messages');
      if (chatMessages) chatMessages.innerHTML = '';
    },

    /**
     * Render the full ARIA chat widget into a container element.
     * @param {HTMLElement} containerEl
     */
    renderUI(containerEl) {
      if (!containerEl) {
        console.warn('[TDRNai.chat] renderUI: container element not found.');
        return;
      }
      this._container = containerEl;

      containerEl.innerHTML = `
        <div class="aria-chat-widget" role="complementary" aria-label="ARIA AI Assistant">
          <div class="aria-chat-header">
            <div class="aria-chat-title">
              <span class="aria-status-dot" aria-hidden="true"></span>
              <span class="aria-title-text">ARIA</span>
              <span class="aria-subtitle">AI Response Assistant</span>
            </div>
            <div class="aria-chat-controls">
              <button class="aria-btn aria-clear-btn" onclick="TDRNai.chat.clear()" aria-label="Clear conversation history" title="Clear conversation">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
              <button class="aria-btn aria-minimize-btn" onclick="TDRNai.chat._toggleMinimize()" aria-label="Minimize chat" title="Minimize">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>

          <div class="aria-chat-body">
            <div class="aria-messages" role="log" aria-live="polite" aria-label="Conversation with ARIA">
              <div class="aria-message aria-message--assistant">
                <div class="aria-message-bubble">
                  <strong>ARIA online.</strong> I have full situational awareness of the Warren County Tornado Response — Day 3. 8 teams deployed, 142 personnel active, ICS Type 3 structure in effect. What do you need?
                </div>
                <div class="aria-message-time" aria-label="Message time">Just now</div>
              </div>
            </div>

            <div class="aria-typing" aria-live="polite" aria-label="ARIA is typing" style="display:none">
              <span></span><span></span><span></span>
            </div>
          </div>

          <div class="aria-quick-prompts" aria-label="Quick prompts">
            <button class="aria-quick-btn" onclick="TDRNai.chat._quickSend(this, 'What teams are available for deployment right now?')" aria-label="Quick prompt: Deploy Team">Deploy Team</button>
            <button class="aria-quick-btn" onclick="TDRNai.chat._quickSend(this, 'Generate an ICS-209 status summary for today.')" aria-label="Quick prompt: Generate Report">Generate Report</button>
            <button class="aria-quick-btn" onclick="TDRNai.chat._quickSend(this, 'What is the current readiness score and what are the top gaps?')" aria-label="Quick prompt: Check Readiness">Check Readiness</button>
            <button class="aria-quick-btn" onclick="TDRNai.chat._quickSend(this, 'Draft an emergency alert for all team leaders.')" aria-label="Quick prompt: Draft Alert">Draft Alert</button>
            <button class="aria-quick-btn" onclick="TDRNai.chat._quickSend(this, 'Analyze the current incident and recommend next actions.')" aria-label="Quick prompt: Analyze Incident">Analyze Incident</button>
          </div>

          <div class="aria-input-area">
            <label for="aria-input" class="sr-only">Message ARIA</label>
            <textarea
              id="aria-input"
              class="aria-input"
              placeholder="Ask ARIA anything about the incident, members, equipment, or request a report…"
              rows="2"
              aria-label="Message ARIA"
              aria-describedby="aria-send-hint"
            ></textarea>
            <div class="aria-input-actions">
              <span id="aria-send-hint" class="sr-only">Press Ctrl+Enter to send</span>
              <button class="aria-send-btn" onclick="TDRNai.chat._sendFromUI()" aria-label="Send message to ARIA">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;

      // Inject widget styles
      this._injectStyles();

      // Wire keyboard shortcut: Ctrl+Enter to send
      const input = containerEl.querySelector('#aria-input');
      if (input) {
        input.addEventListener('keydown', e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this._sendFromUI();
          }
        });
      }
    },

    async _sendFromUI() {
      const input = this._container?.querySelector('#aria-input');
      const text = input?.value?.trim();
      if (!text) return;

      input.value = '';
      input.style.height = 'auto';

      this._appendMessage('user', text);
      this._showTyping(true);

      const res = await this.send(text);
      this._showTyping(false);
      this._appendMessage('assistant', res.success ? res.data : `⚠ ${res.error}`);
    },

    async _quickSend(btn, message) {
      // Disable all quick buttons while processing
      const btns = this._container?.querySelectorAll('.aria-quick-btn');
      btns?.forEach(b => b.disabled = true);

      this._appendMessage('user', message);
      this._showTyping(true);

      const res = await this.send(message);
      this._showTyping(false);
      this._appendMessage('assistant', res.success ? res.data : `⚠ ${res.error}`);

      btns?.forEach(b => b.disabled = false);
    },

    _appendMessage(role, text) {
      const log = this._container?.querySelector('.aria-messages');
      if (!log) return;

      const div = document.createElement('div');
      div.className = `aria-message aria-message--${role}`;
      div.setAttribute('role', role === 'user' ? 'none' : 'none');

      const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const formattedText = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      div.innerHTML = `
        <div class="aria-message-bubble">${formattedText}</div>
        <div class="aria-message-time">${now}</div>
      `;

      log.appendChild(div);
      log.scrollTop = log.scrollHeight;

      // Announce to screen reader
      if (role === 'assistant' && window.TDRN?.announceToScreenReader) {
        TDRN.announceToScreenReader('ARIA responded: ' + text.substring(0, 100));
      }
    },

    _showTyping(show) {
      const indicator = this._container?.querySelector('.aria-typing');
      if (indicator) indicator.style.display = show ? 'flex' : 'none';
      if (show) {
        const log = this._container?.querySelector('.aria-messages');
        if (log) log.scrollTop = log.scrollHeight;
      }
    },

    _toggleMinimize() {
      this._minimized = !this._minimized;
      const body = this._container?.querySelector('.aria-chat-body');
      const prompts = this._container?.querySelector('.aria-quick-prompts');
      const inputArea = this._container?.querySelector('.aria-input-area');
      const btn = this._container?.querySelector('.aria-minimize-btn');

      [body, prompts, inputArea].forEach(el => {
        if (el) el.style.display = this._minimized ? 'none' : '';
      });
      if (btn) btn.setAttribute('aria-label', this._minimized ? 'Expand chat' : 'Minimize chat');
    },

    _injectStyles() {
      if (document.getElementById('aria-chat-styles')) return;
      const style = document.createElement('style');
      style.id = 'aria-chat-styles';
      style.textContent = `
        .aria-chat-widget {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 500px;
          background: #0F1011;
          border: 1px solid #252830;
          border-radius: 12px;
          overflow: hidden;
          font-family: 'Inter', sans-serif;
        }
        .aria-chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: #16181D;
          border-bottom: 1px solid #252830;
          flex-shrink: 0;
        }
        .aria-chat-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .aria-status-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #34D399;
          box-shadow: 0 0 6px #34D399;
          animation: aria-pulse 2s infinite;
        }
        @keyframes aria-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .aria-title-text {
          font-size: 14px;
          font-weight: 700;
          color: #F5C400;
          letter-spacing: 0.08em;
        }
        .aria-subtitle {
          font-size: 11px;
          color: #6B7280;
        }
        .aria-chat-controls {
          display: flex;
          gap: 4px;
        }
        .aria-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px; height: 28px;
          border-radius: 6px;
          background: transparent;
          border: 1px solid #252830;
          color: #6B7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .aria-btn:hover { background: #1C1F26; color: #9CA3AF; }
        .aria-chat-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .aria-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
          scrollbar-color: #252830 transparent;
        }
        .aria-message { display: flex; flex-direction: column; max-width: 88%; }
        .aria-message--user { align-self: flex-end; align-items: flex-end; }
        .aria-message--assistant { align-self: flex-start; align-items: flex-start; }
        .aria-message-bubble {
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.55;
        }
        .aria-message--user .aria-message-bubble {
          background: rgba(245, 196, 0, 0.15);
          border: 1px solid rgba(245, 196, 0, 0.25);
          color: #F9FAFB;
          border-bottom-right-radius: 4px;
        }
        .aria-message--assistant .aria-message-bubble {
          background: #16181D;
          border: 1px solid #252830;
          color: #D1D5DB;
          border-bottom-left-radius: 4px;
        }
        .aria-message-time {
          font-size: 10px;
          color: #4B5563;
          margin-top: 3px;
          padding: 0 4px;
        }
        .aria-typing {
          display: none;
          align-items: center;
          gap: 4px;
          padding: 0 16px 8px;
        }
        .aria-typing span {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #4B5563;
          animation: aria-bounce 1.2s infinite;
        }
        .aria-typing span:nth-child(2) { animation-delay: 0.2s; }
        .aria-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes aria-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        .aria-quick-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 8px 16px;
          border-top: 1px solid #252830;
          flex-shrink: 0;
        }
        .aria-quick-btn {
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(245, 196, 0, 0.08);
          border: 1px solid rgba(245, 196, 0, 0.2);
          color: #F5C400;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: 'Inter', sans-serif;
          min-height: 28px;
        }
        .aria-quick-btn:hover {
          background: rgba(245, 196, 0, 0.15);
          border-color: rgba(245, 196, 0, 0.35);
        }
        .aria-quick-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .aria-input-area {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 10px 16px 14px;
          border-top: 1px solid #252830;
          flex-shrink: 0;
        }
        .aria-input {
          flex: 1;
          background: #0A0B0D;
          border: 1px solid #252830;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: #D1D5DB;
          font-family: 'Inter', sans-serif;
          resize: none;
          min-height: 44px;
          max-height: 120px;
          transition: border-color 0.15s ease;
        }
        .aria-input:focus {
          outline: 2px solid #F5C400;
          outline-offset: 2px;
          border-color: #F5C400;
        }
        .aria-input::placeholder { color: #4B5563; }
        .aria-send-btn {
          width: 40px; height: 40px;
          border-radius: 8px;
          background: #F5C400;
          border: none;
          color: #000;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .aria-send-btn:hover { background: #D4A800; }
        .aria-send-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      `;
      document.head.appendChild(style);
    }
  },


  // =============================================================================
  // 7. UI RENDER HELPERS
  // =============================================================================
  render: {

    /**
     * Render the Smart Dispatch AI panel in a container element.
     * @param {HTMLElement} containerEl
     */
    showDispatchPanel(containerEl) {
      if (!containerEl) return;
      containerEl.innerHTML = `
        <div class="ai-panel">
          <div class="ai-panel-header">
            <span class="ai-panel-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </span>
            <h3 class="ai-panel-title">Smart Dispatch</h3>
          </div>
          <p class="ai-panel-desc">Describe an incident and ARIA will recommend optimal team and equipment assignments.</p>
          <div class="form-group">
            <label for="dispatch-input" class="form-label">Incident Description</label>
            <textarea id="dispatch-input" class="form-textarea" rows="3" placeholder="e.g. Structure fire at 142 Oak Street, 2-story residential, possible entrapment reported…"></textarea>
          </div>
          <button class="topbar-btn primary" style="width:100%" onclick="TDRNai.render._runDispatch(this)" aria-label="Analyze incident with ARIA">
            Analyze with ARIA
          </button>
          <div id="dispatch-result" class="ai-result" aria-live="polite" style="display:none"></div>
        </div>
      `;
    },

    async _runDispatch(btn) {
      const input = document.getElementById('dispatch-input');
      const result = document.getElementById('dispatch-result');
      if (!input?.value?.trim()) return;

      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      const res = await TDRNai.dispatch.analyzeIncident(input.value);
      btn.disabled = false;
      btn.textContent = 'Analyze with ARIA';

      if (!result) return;
      result.style.display = 'block';

      if (!res.success) {
        result.innerHTML = `<div class="alert alert-danger" role="alert">Error: ${res.error}</div>`;
        return;
      }

      const d = res.data;
      result.innerHTML = `
        <div class="ai-result-card">
          <div class="ai-result-row"><strong>Incident Type:</strong> ${d.incidentType || 'Unknown'}</div>
          <div class="ai-result-row"><strong>Severity:</strong> Level ${d.severity}/5</div>
          <div class="ai-result-row"><strong>ICS Level:</strong> Type ${d.icsLevel}</div>
          <div class="ai-result-row"><strong>Recommended Teams:</strong> ${(d.recommendedTeams || []).join(', ')}</div>
          <div class="ai-result-row"><strong>Equipment Needed:</strong> ${(d.recommendedEquipment || []).join(', ')}</div>
          <div class="ai-result-row"><strong>Est. Personnel:</strong> ${d.estimatedPersonnel}</div>
          <div class="ai-result-section"><strong>Priority Actions:</strong>
            <ol>${(d.priorityActions || []).map(a => `<li>${a}</li>`).join('')}</ol>
          </div>
        </div>
      `;
    },

    /**
     * Render predictive analytics cards.
     * @param {HTMLElement} containerEl
     */
    showPredictivePanel(containerEl) {
      if (!containerEl) return;
      const predictions = [
        { confidence: 87, title: 'Training Compliance Risk', text: 'Compliance will drop below 80% within 14 days if no training is scheduled.', action: 'Schedule Training', type: 'warning' },
        { confidence: 74, title: 'Equipment Maintenance Due', text: '3 items (Chainsaw #2, Generator B, Skid Steer A) are overdue for inspection.', action: 'View Equipment', type: 'warning' },
        { confidence: 91, title: 'Certification Expirations', text: '12 certifications expire within 30 days. 4 are First Aid/CPR — critical for deployment.', action: 'View Certs', type: 'critical' },
        { confidence: 62, title: 'Staffing Gap Forecast', text: 'Based on incident duration trends, additional volunteer recruitment needed within 45 days.', action: 'View Applicants', type: 'info' }
      ];

      containerEl.innerHTML = predictions.map(p => `
        <div class="ai-prediction-card ai-prediction-${p.type}">
          <div class="ai-prediction-header">
            <span class="ai-confidence" aria-label="Confidence score: ${p.confidence}%">${p.confidence}% confidence</span>
            <strong class="ai-prediction-title">${p.title}</strong>
          </div>
          <p class="ai-prediction-text">${p.text}</p>
          <button class="topbar-btn ghost" style="padding: 0 10px; font-size:12px; min-height:32px" aria-label="${p.action}">${p.action} →</button>
        </div>
      `).join('');
    },

    /**
     * Show AI-generated situation summary banner at top of a container.
     * @param {HTMLElement} containerEl
     * @param {object}      incidentData
     */
    showInsightsBanner(containerEl, incidentData = {}) {
      if (!containerEl) return;
      containerEl.innerHTML = `
        <div class="ai-insights-banner" role="region" aria-label="ARIA Intelligence Summary">
          <div class="ai-insights-header">
            <span aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C400" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
            <span class="ai-insights-label">ARIA Intelligence Summary</span>
            <span class="ai-insights-time">Updated 2 min ago</span>
          </div>
          <p class="ai-insights-text">Tornado response on track. Eastern sector debris clearance at 73% completion. Shelter capacity stable at 61%. Team rotation recommended at 18:00 hrs — Team Alpha has been active 14+ hours. Certification compliance holding at 87%. No critical resource shortfalls detected.</p>
        </div>
      `;
    }
  },


  // =============================================================================
  // 8. ERROR HANDLING & GRACEFUL DEGRADATION
  // =============================================================================
  // All public methods above already return { success, data, error }.
  // Additional utility for UI state:

  isConfigured() {
    return Boolean(this._config.key && this._config.key.length > 10);
  },

  getUsageStats() {
    return {
      requests:      this.usage.requests,
      tokensIn:      this.usage.tokensIn,
      tokensOut:     this.usage.tokensOut,
      totalTokens:   this.usage.tokensIn + this.usage.tokensOut,
      errors:        this.usage.errors,
      estimatedCost: `$${this.usage.estimatedCost.toFixed(4)}`
    };
  }
};

// Inject shared AI panel CSS
(function injectAIPanelStyles() {
  if (document.getElementById('tdrn-ai-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'tdrn-ai-panel-styles';
  style.textContent = `
    .ai-panel { display: flex; flex-direction: column; gap: 12px; }
    .ai-panel-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .ai-panel-icon { color: #F5C400; display: flex; }
    .ai-panel-title { font-family: 'Oswald', sans-serif; font-size: 16px; color: #F9FAFB; margin: 0; }
    .ai-panel-desc { font-size: 13px; color: #9CA3AF; margin: 0; line-height: 1.5; }
    .ai-result { margin-top: 12px; }
    .ai-result-card {
      background: rgba(245, 196, 0, 0.05);
      border: 1px solid rgba(245, 196, 0, 0.2);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ai-result-row { font-size: 13px; color: #D1D5DB; }
    .ai-result-row strong { color: #F9FAFB; margin-right: 6px; }
    .ai-result-section { font-size: 13px; color: #D1D5DB; }
    .ai-result-section ol { margin: 6px 0 0 16px; display: flex; flex-direction: column; gap: 4px; }
    .ai-prediction-card {
      background: #16181D;
      border: 1px solid #252830;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 10px;
    }
    .ai-prediction-warning { border-left: 3px solid #F5C400; }
    .ai-prediction-critical { border-left: 3px solid #F87171; }
    .ai-prediction-info    { border-left: 3px solid #60A5FA; }
    .ai-prediction-header  { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
    .ai-confidence { font-size: 11px; font-weight: 700; color: #9CA3AF; font-family: 'JetBrains Mono', monospace; }
    .ai-prediction-title { font-size: 14px; color: #F9FAFB; }
    .ai-prediction-text { font-size: 13px; color: #9CA3AF; margin: 0 0 10px; line-height: 1.5; }
    .ai-insights-banner {
      background: rgba(245, 196, 0, 0.06);
      border: 1px solid rgba(245, 196, 0, 0.2);
      border-radius: 8px;
      padding: 14px 18px;
    }
    .ai-insights-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .ai-insights-label { font-size: 13px; font-weight: 600; color: #F5C400; }
    .ai-insights-time { font-size: 11px; color: #6B7280; margin-left: auto; }
    .ai-insights-text { font-size: 13px; color: #D1D5DB; margin: 0; line-height: 1.6; }
  `;
  document.head.appendChild(style);
})();

// Expose globally
window.TDRNai = TDRNai;

console.log('[TDRN AI Engine] Loaded. Call TDRNai.configure(apiKey) to enable live AI. Demo mode active by default.');
