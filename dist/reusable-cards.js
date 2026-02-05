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
      type: 'custom:reusable-card-parent',
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
    this._cardEditorEl = null;
    this._cardGUIMode = true;
    this._cardGUIModeAvailable = true;
  }

  setConfig(config) {
    this._config = {
      type: config.type || 'custom:reusable-card-parent',
      hash: config.hash || '#my-card',
      card: config.card || null
    };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._cardEditorEl) {
      this._cardEditorEl.hass = hass;
    }
    if (!this.shadowRoot.hasChildNodes()) {
      this.render();
    }
  }

  configChanged(newConfig) {
    // Always ensure type is present
    newConfig.type = 'custom:reusable-card-parent';
    
    const event = new Event('config-changed', {
      bubbles: true,
      composed: true,
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  _toggleMode() {
    if (this._cardEditorEl && this._cardEditorEl.toggleMode) {
      this._cardEditorEl.toggleMode();
    }
  }

  _cardConfigChanged(ev) {
    ev.stopPropagation();
    const cardConfig = ev.detail.config;
    this._config = { 
      type: 'custom:reusable-card-parent',
      hash: this._config.hash,
      card: cardConfig 
    };
    this._cardGUIModeAvailable = ev.detail.guiModeAvailable !== false;
    this.configChanged(this._config);
  }

  _cardGUIModeChanged(ev) {
    ev.stopPropagation();
    this._cardGUIMode = ev.detail.guiMode;
    this._cardGUIModeAvailable = ev.detail.guiModeAvailable;
    this.requestUpdate();
  }

  requestUpdate() {
    this.render();
  }

  render() {
    if (!this._hass) return;

    const hashValue = this._config.hash || '#my-card';
    const hasCard = this._config.card && this._config.card.type;

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
        .form-group input:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-group small {
          display: block;
          margin-top: 6px;
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .card-editor-container {
          margin-top: 16px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          padding: 16px;
          background: var(--card-background-color);
        }
        .card-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .card-editor-header h3 {
          margin: 0;
          font-size: 1em;
          font-weight: bold;
        }
        .button-group {
          display: flex;
          gap: 8px;
        }
        .mode-toggle, .change-card {
          padding: 4px 12px;
          border: 1px solid var(--primary-color);
          border-radius: 4px;
          background: transparent;
          color: var(--primary-color);
          cursor: pointer;
          font-size: 12px;
        }
        .mode-toggle:hover, .change-card:hover {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }
        .mode-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        <div class="card-editor-container">
          <div class="card-editor-header">
            <h3>Card Configuration</h3>
            ${hasCard ? `
              <div class="button-group">
                <button 
                  class="mode-toggle" 
                  id="toggle-mode"
                  ${!this._cardGUIModeAvailable ? 'disabled' : ''}
                >
                  ${this._cardGUIMode ? 'Show Code Editor' : 'Show Visual Editor'}
                </button>
                <button class="change-card" id="change-card">
                  Change Card
                </button>
              </div>
            ` : ''}
          </div>
          <div id="card-editor-placeholder"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderCardEditor();
  }

  async renderCardEditor() {
    const placeholder = this.shadowRoot.getElementById('card-editor-placeholder');
    if (!placeholder || !this._hass) return;

    // Clear existing editor
    placeholder.innerHTML = '';

    if (this._config.card && this._config.card.type) {
      // Create card element editor for existing card
      const cardEditor = document.createElement('hui-card-element-editor');
      cardEditor.hass = this._hass;
      cardEditor.value = this._config.card;
      
      cardEditor.addEventListener('config-changed', this._cardConfigChanged.bind(this));
      cardEditor.addEventListener('GUImode-changed', this._cardGUIModeChanged.bind(this));
      
      placeholder.appendChild(cardEditor);
      this._cardEditorEl = cardEditor;
    } else {
      // Create card picker for new card
      const cardPicker = document.createElement('hui-card-picker');
      cardPicker.hass = this._hass;
      
      cardPicker.addEventListener('config-changed', this._cardConfigChanged.bind(this));
      
      placeholder.appendChild(cardPicker);
      this._cardEditorEl = null;
    }
  }

  attachEventListeners() {
    const hashInput = this.shadowRoot.getElementById('hash');
    const toggleButton = this.shadowRoot.getElementById('toggle-mode');
    const changeCardButton = this.shadowRoot.getElementById('change-card');

    if (hashInput) {
      hashInput.addEventListener('change', (e) => {
        let hash = e.target.value.trim();
        // Auto-add # if missing
        if (hash && !hash.startsWith('#')) {
          hash = '#' + hash;
          e.target.value = hash;
        }
        if (this._config.hash !== hash) {
          this._config = { 
            type: 'custom:reusable-card-parent',
            hash: hash, 
            card: this._config.card 
          };
          this.configChanged(this._config);
        }
      });
    }

    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this._toggleMode();
      });
    }

    if (changeCardButton) {
      changeCardButton.addEventListener('click', () => {
        this._config = { 
          type: 'custom:reusable-card-parent',
          hash: this._config.hash, 
          card: null 
        };
        this.configChanged(this._config);
        this.render();
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
      type: 'custom:reusable-card-child',
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
    // Always ensure type is present
    newConfig.type = 'custom:reusable-card-child';
    
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
        this._config = { 
          type: 'custom:reusable-card-child',
          hash: e.target.value 
        };
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
  type: 'custom:reusable-card-parent',
  name: 'Reusable Card Parent',
  description: 'Define and display a reusable card template',
  preview: true,
});
window.customCards.push({
  type: 'custom:reusable-card-child',
  name: 'Reusable Card Child',
  description: 'Display a saved card template',
  preview: false,
});

console.info(
  '%c REUSABLE-CARDS %c v1.1.3 ',
  'color: white; background: #3498db; font-weight: bold;',
  'color: #3498db; background: white; font-weight: bold;'
);