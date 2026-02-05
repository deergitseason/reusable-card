// Reusable Cards for Home Assistant
// Parent and Child card components

let parentInstanceCounter = 0;

class ReusableCardParent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._saveTimeout = null;
    this._instanceId = ++parentInstanceCounter;
    console.log(`[ReusableCards Parent #${this._instanceId}] Constructor called`);
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    if (!config.card) {
      throw new Error('You must specify a card configuration');
    }
    
    const oldConfig = JSON.stringify(this._config);
    const newConfig = JSON.stringify(config);
    const configChanged = oldConfig !== newConfig;
    
    console.log(`[ReusableCards Parent #${this._instanceId}] setConfig called for "${config.hash}", changed: ${configChanged}`);
    if (configChanged) {
      console.log(`[ReusableCards Parent #${this._instanceId}] Old:`, this._config);
      console.log(`[ReusableCards Parent #${this._instanceId}] New:`, config);
    }
    
    this._config = config;
    
    this.createCard();
    
    // Only save if config actually changed and we have hass
    if (configChanged && this._hass) {
      console.log(`[ReusableCards Parent #${this._instanceId}] Config changed, triggering save`);
      this.debouncedSave();
    } else if (!configChanged) {
      console.log(`[ReusableCards Parent #${this._instanceId}] Config unchanged, skipping save`);
    } else if (!this._hass) {
      console.log(`[ReusableCards Parent #${this._instanceId}] No hass yet, will save when hass arrives`);
    }
  }

  set hass(hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    
    // Pass hass to the child card if it exists
    if (this._cardElement && this._cardElement.hass !== hass) {
      this._cardElement.hass = hass;
    }
    
    // Save on first hass assignment if we have config
    if (firstHass && this._config.hash && this._config.card) {
      console.log(`[ReusableCards Parent #${this._instanceId}] First hass received, triggering save for "${this._config.hash}"`);
      this.debouncedSave();
    }
  }

  debouncedSave() {
    // Clear any pending save
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    
    // Wait 500ms after last change before saving
    this._saveTimeout = setTimeout(() => {
      this.saveToStorage();
    }, 500);
  }

  async saveToStorage() {
    if (!this._hass) {
      console.warn(`[ReusableCards Parent #${this._instanceId}] Cannot save: hass not available`);
      return;
    }
    if (!this._config.hash) {
      console.warn(`[ReusableCards Parent #${this._instanceId}] Cannot save: no hash configured`);
      return;
    }
    if (!this._config.card) {
      console.warn(`[ReusableCards Parent #${this._instanceId}] Cannot save: no card config`);
      return;
    }

    try {
      console.log(`[ReusableCards Parent #${this._instanceId}] Saving "${this._config.hash}":`, this._config.card);
      
      await this._hass.callService('reusable_cards', 'save_card', {
        hash: this._config.hash,
        config: this._config.card
      });
      
      console.log(`[ReusableCards Parent #${this._instanceId}] Successfully saved "${this._config.hash}"`);
      
      // Debug: Check sensor state after a short delay
      setTimeout(() => {
        const sensor = this._hass.states['sensor.reusable_cards'];
        console.log(`[ReusableCards Parent #${this._instanceId}] Sensor state after save:`, sensor?.attributes?.cards);
      }, 1000);
      
    } catch (error) {
      console.error(`[ReusableCards Parent #${this._instanceId}] Error saving:`, error);
    }
  }

  async createCard() {
    if (!this._config.card) return;

    try {
      const cardElement = await this.createCardElement(this._config.card);
      
      if (this._cardElement && this._cardElement.parentNode) {
        this.shadowRoot.removeChild(this._cardElement);
      }
      
      this._cardElement = cardElement;
      if (this._hass) {
        this._cardElement.hass = this._hass;
      }
      
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(this._cardElement);
    } catch (error) {
      console.error('Error creating card:', error);
      this.showError(`Error creating card: ${error.message}`);
    }
  }

  async createCardElement(config) {
    // Handle custom cards
    if (config.type && config.type.startsWith('custom:')) {
      const tagName = config.type.replace('custom:', '');
      const element = document.createElement(tagName);
      
      if (element.setConfig) {
        element.setConfig(config);
      }
      
      return element;
    }
    
    // Handle built-in cards using Home Assistant's helper
    const helpers = await window.loadCardHelpers?.();
    if (helpers) {
      return helpers.createCardElement(config);
    }
    
    // Fallback: create element directly
    const element = document.createElement(`hui-${config.type}-card`);
    if (element.setConfig) {
      element.setConfig(config);
    }
    return element;
  }

  showError(message) {
    this.shadowRoot.innerHTML = `
      <style>
        .error {
          background: var(--error-color);
          color: white;
          padding: 16px;
          border-radius: 4px;
        }
      </style>
      <ha-card>
        <div class="error">
          <strong>Reusable Card Parent Error</strong><br>
          ${message}
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    if (this._cardElement && this._cardElement.getCardSize) {
      return this._cardElement.getCardSize();
    }
    return 3;
  }

  static getConfigElement() {
    return document.createElement('reusable-card-parent-editor');
  }

  static getStubConfig() {
    return {
      hash: '#my-card',
      card: {
        type: 'entities',
        entities: ['sun.sun']
      }
    };
  }
}

class ReusableCardParentEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = {
      hash: config.hash || '#my-card',
      card: config.card || { type: 'entities', entities: ['sun.sun'] }
    };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot.hasChildNodes()) {
      this.render();
    }
  }

  configChanged(newConfig) {
    const event = new Event('config-changed', {
      bubbles: true,
      composed: true,
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  // Simple YAML-like stringify (basic formatting)
  toYamlish(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let result = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            result += `${spaces}  - ${this.toYamlish(item, indent + 2).trim()}\n`;
          } else {
            result += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        result += `${spaces}${key}:\n${this.toYamlish(value, indent + 1)}`;
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    }
    return result;
  }

  // Simple YAML-like parser
  parseYamlish(text) {
    try {
      // Use a simple approach: convert to JSON-ish and parse
      // This handles basic YAML-like syntax
      const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
      const result = {};
      let currentObj = result;
      const stack = [{ obj: result, indent: -1 }];
      let currentArray = null;
      let currentArrayKey = null;
      
      for (const line of lines) {
        const indent = line.search(/\S/);
        const trimmed = line.trim();
        
        // Pop stack to find parent at correct indent level
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        currentObj = stack[stack.length - 1].obj;
        
        if (trimmed.startsWith('- ')) {
          // Array item
          const value = trimmed.slice(2).trim();
          if (currentArrayKey && Array.isArray(currentObj[currentArrayKey])) {
            if (value.includes(':')) {
              // Object in array
              const [k, v] = value.split(':').map(s => s.trim());
              currentObj[currentArrayKey].push({ [k]: this.parseValue(v) });
            } else {
              currentObj[currentArrayKey].push(this.parseValue(value));
            }
          }
        } else if (trimmed.includes(':')) {
          const colonIndex = trimmed.indexOf(':');
          const key = trimmed.slice(0, colonIndex).trim();
          const value = trimmed.slice(colonIndex + 1).trim();
          
          if (value === '') {
            // Could be object or array - check next line
            currentObj[key] = {};
            stack.push({ obj: currentObj[key], indent: indent });
            currentArrayKey = key;
          } else if (value === '[]') {
            currentObj[key] = [];
            currentArrayKey = key;
          } else {
            currentObj[key] = this.parseValue(value);
          }
          
          // Check if this starts an array
          if (value === '' || value === '[]') {
            currentObj[key] = [];
            currentArrayKey = key;
          }
        }
      }
      
      return result;
    } catch (e) {
      console.error('YAML parse error:', e);
      return null;
    }
  }
  
  parseValue(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    // Remove quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    return val;
  }

  render() {
    const hashValue = this._config.hash || '#my-card';
    const cardYaml = this.toYamlish(this._config.card || { type: 'entities', entities: ['sun.sun'] });

    this.shadowRoot.innerHTML = `
      <style>
        .editor {
          padding: 16px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        .form-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
          font-size: 14px;
        }
        .form-group textarea {
          width: 100%;
          min-height: 150px;
          padding: 10px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
          font-family: monospace;
          font-size: 13px;
          resize: vertical;
        }
        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-group small {
          display: block;
          margin-top: 6px;
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .info {
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 0.9em;
        }
        .error {
          color: var(--error-color);
          font-size: 12px;
          margin-top: 4px;
        }
      </style>
      <div class="editor">
        <div class="info">
          <strong>Reusable Card Parent</strong><br>
          Define a card template that can be reused with child cards.
        </div>
        
        <div class="form-group">
          <label for="hash">Template Hash</label>
          <input 
            type="text" 
            id="hash" 
            value="${hashValue}"
            placeholder="#camera"
          />
          <small>Unique identifier (e.g., #camera, #lights, #weather)</small>
        </div>
        
        <div class="form-group">
          <label for="card-yaml">Card Configuration (YAML)</label>
          <textarea id="card-yaml" placeholder="type: entities
entities:
  - sun.sun">${cardYaml}</textarea>
          <small>Define the card that will be displayed and reused</small>
          <div id="yaml-error" class="error" style="display: none;"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const hashInput = this.shadowRoot.getElementById('hash');
    const cardYamlTextarea = this.shadowRoot.getElementById('card-yaml');
    const yamlError = this.shadowRoot.getElementById('yaml-error');

    if (hashInput) {
      hashInput.addEventListener('change', (e) => {
        let hash = e.target.value.trim();
        // Auto-add # if missing
        if (hash && !hash.startsWith('#')) {
          hash = '#' + hash;
          e.target.value = hash;
        }
        if (this._config.hash !== hash) {
          this._config = { ...this._config, hash };
          this.configChanged(this._config);
        }
      });
    }

    if (cardYamlTextarea) {
      let debounceTimer;
      cardYamlTextarea.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const yaml = e.target.value;
          try {
            // Try to parse as JSON first (in case they paste JSON)
            let parsed;
            if (yaml.trim().startsWith('{')) {
              parsed = JSON.parse(yaml);
            } else {
              parsed = this.parseYamlish(yaml);
            }
            
            if (parsed && parsed.type) {
              yamlError.style.display = 'none';
              this._config = { ...this._config, card: parsed };
              this.configChanged(this._config);
            } else {
              yamlError.textContent = 'Card must have a "type" property';
              yamlError.style.display = 'block';
            }
          } catch (err) {
            yamlError.textContent = 'Invalid YAML/JSON: ' + err.message;
            yamlError.style.display = 'block';
          }
        }, 500);
      });
    }
  }
}

class ReusableCardChild extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._lastCardConfig = null; // Track the config we rendered
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    this._config = config;
    this._lastCardConfig = null; // Reset so we rebuild
    this.createCard();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Check if the card template has changed
    const sensor = hass.states['sensor.reusable_cards'];
    const cards = sensor?.attributes?.cards || {};
    const currentConfig = cards[this._config.hash];
    const configJson = JSON.stringify(currentConfig);
    
    // Rebuild card if the template changed
    if (configJson !== this._lastCardConfig) {
      this.createCard();
    } else if (this._cardElement && this._cardElement.hass !== hass) {
      // Just pass hass update to existing card
      this._cardElement.hass = hass;
    }
  }

  async createCard() {
    if (!this._hass || !this._config.hash) return;

    // Get card config from sensor
    const sensor = this._hass.states['sensor.reusable_cards'];
    if (!sensor || !sensor.attributes || !sensor.attributes.cards) {
      this.showError('Reusable Cards integration not found. Make sure it is installed and Home Assistant has been restarted.');
      return;
    }

    const cards = sensor.attributes.cards;
    const cardConfig = cards[this._config.hash];
    
    if (!cardConfig) {
      this.showError(`Card template "${this._config.hash}" not found. Make sure you have a reusable-card-parent card with this hash.`);
      this._lastCardConfig = null;
      return;
    }

    const configJson = JSON.stringify(cardConfig);
    
    // Skip if we already rendered this exact config
    if (configJson === this._lastCardConfig && this._cardElement) {
      return;
    }

    // Create the card element
    try {
      const cardElement = await this.createCardElement(cardConfig);
      
      if (this._cardElement && this._cardElement.parentNode) {
        this.shadowRoot.removeChild(this._cardElement);
      }
      
      this._cardElement = cardElement;
      this._cardElement.hass = this._hass;
      this._lastCardConfig = configJson; // Track what we rendered
      
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(this._cardElement);
    } catch (error) {
      console.error('Error creating card:', error);
      this.showError(`Error creating card: ${error.message}`);
    }
  }

  async createCardElement(config) {
    // Handle custom cards
    if (config.type && config.type.startsWith('custom:')) {
      const tagName = config.type.replace('custom:', '');
      const element = document.createElement(tagName);
      
      if (element.setConfig) {
        element.setConfig(config);
      }
      
      return element;
    }
    
    // Handle built-in cards using Home Assistant's helper
    const helpers = await window.loadCardHelpers?.();
    if (helpers) {
      return helpers.createCardElement(config);
    }
    
    // Fallback: create element directly
    const element = document.createElement(`hui-${config.type}-card`);
    if (element.setConfig) {
      element.setConfig(config);
    }
    return element;
  }

  showError(message) {
    this.shadowRoot.innerHTML = `
      <style>
        .error {
          background: var(--error-color);
          color: white;
          padding: 16px;
          border-radius: 4px;
        }
        .error strong {
          display: block;
          margin-bottom: 8px;
        }
      </style>
      <ha-card>
        <div class="error">
          <strong>Reusable Card Error</strong>
          ${message}
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    if (this._cardElement && this._cardElement.getCardSize) {
      return this._cardElement.getCardSize();
    }
    return 3;
  }

  static getConfigElement() {
    return document.createElement('reusable-card-child-editor');
  }

  static getStubConfig() {
    return {
      hash: '#my-card'
    };
  }
}

class ReusableCardChildEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    const oldHashes = this._hass ? 
      Object.keys(this._hass.states['sensor.reusable_cards']?.attributes?.cards || {}).join(',') : '';
    const newHashes = hass ? 
      Object.keys(hass.states['sensor.reusable_cards']?.attributes?.cards || {}).join(',') : '';
    
    this._hass = hass;
    
    // Only re-render if hashes changed (not on every hass update)
    if (oldHashes !== newHashes || !this.shadowRoot.hasChildNodes()) {
      this.render();
    }
  }

  configChanged(newConfig) {
    const event = new Event('config-changed', {
      bubbles: true,
      composed: true,
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  render() {
    if (!this._hass) return;

    const sensor = this._hass.states['sensor.reusable_cards'];
    const cards = sensor?.attributes?.cards || {};
    const hashes = Object.keys(cards);
    const hashValue = this._config.hash || '';

    this.shadowRoot.innerHTML = `
      <style>
        .editor {
          padding: 16px;
        }
        .info {
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 0.9em;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
          font-size: 14px;
          cursor: pointer;
        }
        .form-group select:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-group small {
          display: block;
          margin-top: 8px;
          color: var(--secondary-text-color);
        }
        .no-templates {
          padding: 16px;
          background: var(--warning-color, #ffc107);
          color: var(--primary-text-color);
          border-radius: 4px;
          text-align: center;
        }
      </style>
      <div class="editor">
        <div class="info">
          <strong>Reusable Card Child</strong><br>
          This card displays a card template defined with <code>reusable-card-parent</code>.
        </div>
        
        ${hashes.length > 0 ? `
          <div class="form-group">
            <label for="hash">Select Card Template</label>
            <select id="hash">
              <option value="" ${!hashValue ? 'selected' : ''}>-- Select a template --</option>
              ${hashes.map(h => `
                <option value="${h}" ${hashValue === h ? 'selected' : ''}>${h}</option>
              `).join('')}
            </select>
            <small>Choose from available card templates</small>
          </div>
        ` : `
          <div class="no-templates">
            <strong>No card templates found.</strong><br>
            Create a <code>reusable-card-parent</code> card first.
          </div>
        `}
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const hashSelect = this.shadowRoot.getElementById('hash');
    if (hashSelect) {
      hashSelect.addEventListener('change', (e) => {
        this._config = { ...this._config, hash: e.target.value };
        this.configChanged(this._config);
      });
    }
  }
}

// Register custom elements
customElements.define('reusable-card-parent', ReusableCardParent);
customElements.define('reusable-card-parent-editor', ReusableCardParentEditor);
customElements.define('reusable-card-child', ReusableCardChild);
customElements.define('reusable-card-child-editor', ReusableCardChildEditor);

// Register cards with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'reusable-card-parent',
  name: 'Reusable Card Parent',
  description: 'Define and display a reusable card template',
  preview: true,
});
window.customCards.push({
  type: 'reusable-card-child',
  name: 'Reusable Card Child',
  description: 'Display a saved card template',
  preview: false,
});

console.info(
  '%c REUSABLE-CARDS %c v1.1.1 ',
  'color: white; background: #3498db; font-weight: bold;',
  'color: #3498db; background: white; font-weight: bold;'
);