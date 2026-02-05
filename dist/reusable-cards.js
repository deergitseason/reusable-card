// Reusable Cards for Home Assistant
// Parent and Child card components

class ReusableCardParent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._saveTimeout = null;
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    if (!config.card) {
      throw new Error('You must specify a card configuration');
    }
    
    const configChanged = JSON.stringify(this._config) !== JSON.stringify(config);
    this._config = config;
    
    this.createCard();
    
    // Only save if config actually changed and we have hass
    if (configChanged && this._hass) {
      this.debouncedSave();
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
    if (!this._hass || !this._config.hash || !this._config.card) {
      console.log('Cannot save: missing hass, hash, or card config');
      return;
    }

    try {
      console.log(`Saving card template: ${this._config.hash}`, this._config.card);
      
      await this._hass.callService('reusable_cards', 'save_card', {
        hash: this._config.hash,
        config: this._config.card
      });
      
      console.log(`Successfully saved card template: ${this._config.hash}`);
    } catch (error) {
      console.error('Error saving card template:', error);
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
    this._rendered = false;
  }

  setConfig(config) {
    this._config = {
      hash: config.hash || '#my-card',
      card: config.card || { type: 'entities', entities: [] }
    };
    
    // Only re-render if already rendered (avoid double render)
    if (this._rendered) {
      this.updateHashInput();
    } else {
      this.render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    
    // Update card editor with hass if it exists
    const cardEditor = this.shadowRoot?.querySelector('#card-editor')?.firstElementChild;
    if (cardEditor && cardEditor.hass !== hass) {
      cardEditor.hass = hass;
    }
    
    // Initial render if not done
    if (!this._rendered && this.shadowRoot) {
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

  updateHashInput() {
    const hashInput = this.shadowRoot?.getElementById('hash');
    if (hashInput && hashInput !== this.shadowRoot.activeElement) {
      hashInput.value = this._config.hash || '';
    }
  }

  render() {
    const hashValue = this._config.hash || '';

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
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
        }
        .form-group small {
          display: block;
          margin-top: 4px;
          color: var(--secondary-text-color);
        }
        .card-config {
          margin-top: 16px;
        }
        .info {
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 0.9em;
        }
      </style>
      <div class="editor">
        <div class="info">
          <strong>Reusable Card Parent</strong><br>
          This card displays normally AND saves its config for reuse.
        </div>
        
        <div class="form-group">
          <label for="hash">Hash (unique identifier)</label>
          <input 
            type="text" 
            id="hash" 
            value="${hashValue}"
            placeholder="#camera"
          />
          <small>Use a unique hash like #camera, #lights, etc.</small>
        </div>
        
        <div class="card-config">
          <label><strong>Card Configuration</strong></label>
          <div id="card-editor"></div>
        </div>
      </div>
    `;

    this._rendered = true;
    this.attachEventListeners();
    
    // Delay card editor render to ensure DOM is ready
    requestAnimationFrame(() => this.renderCardEditor());
  }

  attachEventListeners() {
    const hashInput = this.shadowRoot.getElementById('hash');
    if (hashInput) {
      // Only update config on blur (when user leaves field)
      hashInput.addEventListener('blur', (e) => {
        if (this._config.hash !== e.target.value) {
          this._config = { ...this._config, hash: e.target.value };
          this.configChanged(this._config);
        }
      });
      
      // Also update on Enter key
      hashInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur(); // Trigger blur handler
        }
      });
    }
  }

  async renderCardEditor() {
    const cardEditorContainer = this.shadowRoot.getElementById('card-editor');
    if (!cardEditorContainer) return;

    if (!this._hass) {
      cardEditorContainer.innerHTML = '<p>Loading editor...</p>';
      return;
    }

    const cardConfig = this._config.card || { type: 'entities', entities: [] };
    
    // Try to get the card editor element
    const GUIEditor = customElements.get('hui-card-element-editor');
    
    if (GUIEditor) {
      try {
        const editor = new GUIEditor();
        editor.hass = this._hass;
        editor.value = cardConfig;
        
        editor.addEventListener('value-changed', (ev) => {
          ev.stopPropagation();
          // Only update if card config actually changed
          if (JSON.stringify(this._config.card) !== JSON.stringify(ev.detail.value)) {
            this._config = { ...this._config, card: ev.detail.value };
            this.configChanged(this._config);
          }
        });
        
        cardEditorContainer.innerHTML = '';
        cardEditorContainer.appendChild(editor);
      } catch (error) {
        console.error('Error creating card editor:', error);
        this.showEditorFallback(cardEditorContainer, cardConfig);
      }
    } else {
      this.showEditorFallback(cardEditorContainer, cardConfig);
    }
  }

  showEditorFallback(container, cardConfig) {
    container.innerHTML = `
      <div style="padding: 12px; background: var(--secondary-background-color); border-radius: 4px;">
        <p><strong>Visual editor not available.</strong></p>
        <p>Switch to YAML mode to edit the card configuration.</p>
        <p>Current card type: <code>${cardConfig.type || 'none'}</code></p>
        <details>
          <summary>Current config (JSON)</summary>
          <pre style="overflow: auto; padding: 8px; background: var(--primary-background-color); border-radius: 4px;">${JSON.stringify(cardConfig, null, 2)}</pre>
        </details>
      </div>
    `;
  }
}

class ReusableCardChild extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._unsubscribe = null;
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    this._config = config;
    this.createCard();
  }

  set hass(hass) {
    this._hass = hass;
    this.createCard();
    
    // Pass hass to the child card if it exists
    if (this._cardElement && this._cardElement.hass !== hass) {
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
    this._hass = hass;
    this.render();
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
          margin-bottom: 4px;
          font-weight: bold;
        }
        .form-group input {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
        }
        .form-group small {
          display: block;
          margin-top: 4px;
          color: var(--secondary-text-color);
        }
        .available-hashes {
          margin-top: 8px;
          padding: 8px;
          background: var(--card-background-color);
          border-radius: 4px;
          font-size: 0.85em;
        }
        .hash-item {
          padding: 4px 0;
          color: var(--secondary-text-color);
        }
      </style>
      <div class="editor">
        <div class="info">
          <strong>Reusable Card Child</strong><br>
          This card displays a card template defined with <code>reusable-card-parent</code>.
        </div>
        
        <div class="form-group">
          <label for="hash">Card Hash</label>
          <input 
            type="text" 
            id="hash" 
            value="${hashValue}"
            placeholder="#camera"
            list="hash-list"
          />
          <datalist id="hash-list">
            ${hashes.map(h => `<option value="${h}">`).join('')}
          </datalist>
          <small>Enter the hash of the card template you want to display</small>
        </div>
        
        ${hashes.length > 0 ? `
          <div class="available-hashes">
            <strong>Available card templates:</strong>
            ${hashes.map(h => `<div class="hash-item">• ${h}</div>`).join('')}
          </div>
        ` : `
          <div class="available-hashes">
            <strong>No card templates found.</strong><br>
            Create a <code>reusable-card-parent</code> card first.
          </div>
        `}
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const hashInput = this.shadowRoot.getElementById('hash');
    if (hashInput) {
      // Update on blur only
      hashInput.addEventListener('blur', (e) => {
        if (this._config.hash !== e.target.value) {
          this._config = { ...this._config, hash: e.target.value };
          this.configChanged(this._config);
        }
      });
      
      // Also on Enter
      hashInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
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
  '%c REUSABLE-CARDS %c v1.0.6 ',
  'color: white; background: #3498db; font-weight: bold;',
  'color: #3498db; background: white; font-weight: bold;'
);