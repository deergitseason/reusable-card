// Reusable Cards for Home Assistant
// Parent and Child card components with improved GUI editor

const CARD_VERSION = '1.2.0';

let parentInstanceCounter = 0;

// Helper to get card helpers
const getCardHelpers = async () => {
  if (window.loadCardHelpers) {
    return await window.loadCardHelpers();
  }
  return null;
};

// Helper to get lovelace config
const getLovelace = () => {
  const root = document.querySelector('home-assistant');
  const main = root?.shadowRoot?.querySelector('home-assistant-main');
  const panel = main?.shadowRoot?.querySelector('ha-panel-lovelace');
  const lovelace = panel?.lovelace;
  return lovelace;
};

// ============================================================================
// REUSABLE CARD PARENT
// ============================================================================

class ReusableCardParent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._instanceId = ++parentInstanceCounter;
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    this._config = config;
    
    if (config.card) {
      this.createCard();
    } else {
      // No card yet - show placeholder
      this.showPlaceholder();
    }
  }

  set hass(hass) {
    this._hass = hass;
    
    if (this._cardElement && this._cardElement.hass !== hass) {
      this._cardElement.hass = hass;
    }
  }

  connectedCallback() {
    // When the card is added to the DOM (including after save), save to storage
    // Use a small delay to ensure config is fully set
    if (this._config.hash && this._config.card && this._hass) {
      this.saveToStorage();
    }
  }

  async saveToStorage() {
    if (!this._hass || !this._config.hash || !this._config.card) {
      return;
    }

    try {
      await this._hass.callService('reusable_cards', 'save_card', {
        hash: this._config.hash,
        config: this._config.card
      });
    } catch (error) {
      console.error(`[ReusableCards Parent] Error saving:`, error);
    }
  }

  async createCard() {
    if (!this._config.card) return;

    try {
      const helpers = await getCardHelpers();
      let cardElement;
      
      if (helpers) {
        cardElement = await helpers.createCardElement(this._config.card);
      } else {
        cardElement = await this.createCardElementFallback(this._config.card);
      }
      
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

  async createCardElementFallback(config) {
    if (config.type && config.type.startsWith('custom:')) {
      const tagName = config.type.replace('custom:', '');
      const element = document.createElement(tagName);
      if (element.setConfig) {
        element.setConfig(config);
      }
      return element;
    }
    
    const element = document.createElement(`hui-${config.type}-card`);
    if (element.setConfig) {
      element.setConfig(config);
    }
    return element;
  }

  showError(message) {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="background: var(--error-color); color: white; padding: 16px; border-radius: 4px;">
          <strong>Reusable Card Parent Error</strong><br>
          ${message}
        </div>
      </ha-card>
    `;
  }

  showPlaceholder() {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding: 16px; text-align: center; color: var(--secondary-text-color);">
          <p>Select a card type in the editor to get started.</p>
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
      hash: '#my-card'
    };
  }
}

// ============================================================================
// REUSABLE CARD PARENT EDITOR
// ============================================================================

class ReusableCardParentEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._lovelace = null;
    this._helpers = null;
    this._cardEditorEl = null;
    this._subElementEditorConfig = null;
  }

  setConfig(config) {
    this._config = {
      type: config.type || 'custom:reusable-card-parent',
      hash: config.hash || '',
      card: config.card || null
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Pass hass to sub-editors if they exist
    const elements = this.shadowRoot?.querySelectorAll('hui-card-element-editor, hui-card-picker');
    elements?.forEach(el => {
      el.hass = hass;
    });
    
    if (!this.shadowRoot?.hasChildNodes()) {
      this._render();
    }
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
  }

  get lovelace() {
    return this._lovelace || getLovelace();
  }

  _configChanged(newConfig) {
    newConfig.type = 'custom:reusable-card-parent';
    
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _hashChanged(ev) {
    let hash = ev.target.value.trim();
    if (hash && !hash.startsWith('#')) {
      hash = '#' + hash;
    }
    
    this._config = {
      ...this._config,
      hash: hash
    };
    this._configChanged(this._config);
  }

  _cardConfigChanged(ev) {
    ev.stopPropagation();
    
    const cardConfig = ev.detail.config;
    
    this._config = {
      ...this._config,
      card: cardConfig
    };
    this._configChanged(this._config);
    
    // Re-render to show the editor for the new card
    if (!this._config.card?.type && cardConfig?.type) {
      this._render();
    }
  }

  _cardGUIModeChanged(ev) {
    ev.stopPropagation();
    this._GUImode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  _toggleMode() {
    const editor = this.shadowRoot?.querySelector('hui-card-element-editor');
    if (editor?.toggleMode) {
      editor.toggleMode();
    }
  }

  _deleteCard() {
    this._config = {
      ...this._config,
      card: null
    };
    this._configChanged(this._config);
    this._render();
  }

  async _render() {
    if (!this._hass) return;

    const hasCard = this._config.card?.type;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .container {
          padding: 16px;
        }
        .info-box {
          background: var(--secondary-background-color);
          padding: 12px 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          margin-bottom: 16px;
        }
        .info-box strong {
          color: var(--primary-text-color);
        }
        .info-box p {
          margin: 8px 0 0 0;
          color: var(--secondary-text-color);
          font-size: 0.9em;
        }
        
        .form-row {
          margin-bottom: 16px;
        }
        .form-row label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          color: var(--primary-text-color);
        }
        .form-row input {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 8px);
          background: var(--card-background-color, var(--ha-card-background));
          color: var(--primary-text-color);
          font-size: 14px;
          box-sizing: border-box;
        }
        .form-row input:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-row .helper-text {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
        
        .card-section {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
        }
        .card-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--secondary-background-color);
          border-bottom: 1px solid var(--divider-color);
        }
        .card-section-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
        }
        .card-section-content {
          padding: 16px;
        }
        
        .button-row {
          display: flex;
          gap: 8px;
        }
        .editor-button {
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          background: var(--primary-color);
          color: var(--text-primary-color, white);
          font-size: 12px;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .editor-button:hover {
          opacity: 0.9;
        }
        .editor-button.secondary {
          background: transparent;
          border: 1px solid var(--primary-color);
          color: var(--primary-color);
        }
        .editor-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      </style>
      
      <div class="container">
        <div class="info-box">
          <strong>Reusable Card Parent</strong>
          <p>Define a card template that can be reused across your dashboard with child cards.</p>
        </div>
        
        <div class="form-row">
          <label>Template Hash</label>
          <input 
            type="text" 
            id="hash-input"
            value="${this._config.hash || ''}"
            placeholder="#camera"
          />
          <div class="helper-text">
            Unique identifier for this template (e.g., #camera, #lights). 
            Use the same hash in child cards to display this template.
          </div>
        </div>
        
        <div class="card-section">
          <div class="card-section-header">
            <h3>Card Configuration</h3>
            ${hasCard ? `
              <div class="button-row">
                <button class="editor-button secondary" id="toggle-mode-btn">
                  Show Code Editor
                </button>
                <button class="editor-button secondary" id="change-card-btn">
                  Change Card
                </button>
              </div>
            ` : ''}
          </div>
          <div class="card-section-content" id="editor-container">
            <!-- Card editor or picker will be inserted here -->
          </div>
        </div>
      </div>
    `;
    
    // Attach event listeners
    const hashInput = this.shadowRoot.getElementById('hash-input');
    hashInput?.addEventListener('change', this._hashChanged.bind(this));
    hashInput?.addEventListener('input', (ev) => {
      // Live validation feedback
      let val = ev.target.value;
      if (val && !val.startsWith('#')) {
        ev.target.style.borderColor = 'var(--warning-color)';
      } else {
        ev.target.style.borderColor = '';
      }
    });
    
    const toggleBtn = this.shadowRoot.getElementById('toggle-mode-btn');
    toggleBtn?.addEventListener('click', this._toggleMode.bind(this));
    
    const changeBtn = this.shadowRoot.getElementById('change-card-btn');
    changeBtn?.addEventListener('click', this._deleteCard.bind(this));
    
    // Render the card editor or picker
    await this._renderCardEditor();
  }

  async _renderCardEditor() {
    const container = this.shadowRoot.getElementById('editor-container');
    if (!container || !this._hass) return;
    
    container.innerHTML = '';
    
    if (this._config.card?.type) {
      // Show the card element editor for existing card
      const cardEditor = document.createElement('hui-card-element-editor');
      cardEditor.hass = this._hass;
      cardEditor.lovelace = this.lovelace;
      cardEditor.value = this._config.card;
      
      cardEditor.addEventListener('config-changed', this._cardConfigChanged.bind(this));
      cardEditor.addEventListener('GUImode-changed', this._cardGUIModeChanged.bind(this));
      
      container.appendChild(cardEditor);
      this._cardEditorEl = cardEditor;
    } else {
      // Show the card picker to select a new card
      const cardPicker = document.createElement('hui-card-picker');
      cardPicker.hass = this._hass;
      cardPicker.lovelace = this.lovelace;
      
      cardPicker.addEventListener('config-changed', this._cardConfigChanged.bind(this));
      
      container.appendChild(cardPicker);
      this._cardEditorEl = null;
    }
  }
}

// ============================================================================
// REUSABLE CARD CHILD
// ============================================================================

class ReusableCardChild extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._lastCardConfig = null;
  }

  setConfig(config) {
    if (!config.hash) {
      throw new Error('You must specify a hash (e.g., hash: "#camera")');
    }
    
    this._config = config;
    this._lastCardConfig = null;
    this.createCard();
  }

  set hass(hass) {
    this._hass = hass;
    
    const sensor = hass.states['sensor.reusable_cards'];
    const cards = sensor?.attributes?.cards || {};
    const currentConfig = cards[this._config.hash];
    const configJson = JSON.stringify(currentConfig);
    
    if (configJson !== this._lastCardConfig) {
      this.createCard();
    } else if (this._cardElement && this._cardElement.hass !== hass) {
      this._cardElement.hass = hass;
    }
  }

  async createCard() {
    if (!this._hass || !this._config.hash) return;

    const sensor = this._hass.states['sensor.reusable_cards'];
    if (!sensor?.attributes?.cards) {
      this.showError('Reusable Cards integration not found. Make sure it is installed and Home Assistant has been restarted.');
      return;
    }

    const cards = sensor.attributes.cards;
    const cardConfig = cards[this._config.hash];
    
    if (!cardConfig) {
      this.showError(`Card template "${this._config.hash}" not found. Create a reusable-card-parent with this hash first.`);
      this._lastCardConfig = null;
      return;
    }

    const configJson = JSON.stringify(cardConfig);
    
    if (configJson === this._lastCardConfig && this._cardElement) {
      return;
    }

    try {
      const helpers = await getCardHelpers();
      let cardElement;
      
      if (helpers) {
        cardElement = await helpers.createCardElement(cardConfig);
      } else {
        cardElement = await this.createCardElementFallback(cardConfig);
      }
      
      if (this._cardElement?.parentNode) {
        this.shadowRoot.removeChild(this._cardElement);
      }
      
      this._cardElement = cardElement;
      this._cardElement.hass = this._hass;
      this._lastCardConfig = configJson;
      
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(this._cardElement);
    } catch (error) {
      console.error('Error creating card:', error);
      this.showError(`Error creating card: ${error.message}`);
    }
  }

  async createCardElementFallback(config) {
    if (config.type?.startsWith('custom:')) {
      const tagName = config.type.replace('custom:', '');
      const element = document.createElement(tagName);
      if (element.setConfig) {
        element.setConfig(config);
      }
      return element;
    }
    
    const element = document.createElement(`hui-${config.type}-card`);
    if (element.setConfig) {
      element.setConfig(config);
    }
    return element;
  }

  showError(message) {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="background: var(--error-color); color: white; padding: 16px; border-radius: 4px;">
          <strong>Reusable Card Error</strong><br>
          ${message}
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    if (this._cardElement?.getCardSize) {
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

// ============================================================================
// REUSABLE CARD CHILD EDITOR
// ============================================================================

class ReusableCardChildEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._lastHashes = '';
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    const newHashes = Object.keys(hass?.states['sensor.reusable_cards']?.attributes?.cards || {}).join(',');
    const hashesChanged = this._lastHashes !== newHashes;
    
    this._hass = hass;
    this._lastHashes = newHashes;
    
    if (hashesChanged || !this.shadowRoot?.hasChildNodes()) {
      this._render();
    }
  }

  _configChanged(newConfig) {
    newConfig.type = 'custom:reusable-card-child';
    
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _hashChanged(ev) {
    this._config = {
      ...this._config,
      hash: ev.target.value
    };
    this._configChanged(this._config);
  }

  _render() {
    if (!this._hass) return;

    const sensor = this._hass.states['sensor.reusable_cards'];
    const cards = sensor?.attributes?.cards || {};
    const hashes = Object.keys(cards);
    const currentHash = this._config.hash || '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .container {
          padding: 16px;
        }
        .info-box {
          background: var(--secondary-background-color);
          padding: 12px 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          margin-bottom: 16px;
        }
        .info-box strong {
          color: var(--primary-text-color);
        }
        .info-box p {
          margin: 8px 0 0 0;
          color: var(--secondary-text-color);
          font-size: 0.9em;
        }
        
        .form-row {
          margin-bottom: 16px;
        }
        .form-row label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          color: var(--primary-text-color);
        }
        .form-row select {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 8px);
          background: var(--card-background-color, var(--ha-card-background));
          color: var(--primary-text-color);
          font-size: 14px;
          box-sizing: border-box;
          cursor: pointer;
        }
        .form-row select:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-row .helper-text {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
        
        .warning-box {
          background: var(--warning-color);
          color: var(--primary-text-color);
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          text-align: center;
        }
        .warning-box strong {
          display: block;
          margin-bottom: 8px;
        }
        .warning-box code {
          background: rgba(0,0,0,0.1);
          padding: 2px 6px;
          border-radius: 4px;
        }
      </style>
      
      <div class="container">
        <div class="info-box">
          <strong>Reusable Card Child</strong>
          <p>Display a card template that was defined with a parent card.</p>
        </div>
        
        ${hashes.length > 0 ? `
          <div class="form-row">
            <label>Select Card Template</label>
            <select id="hash-select">
              <option value="" ${!currentHash ? 'selected' : ''}>-- Select a template --</option>
              ${hashes.map(h => `
                <option value="${h}" ${currentHash === h ? 'selected' : ''}>${h}</option>
              `).join('')}
            </select>
            <div class="helper-text">
              Choose from available templates defined by parent cards.
            </div>
          </div>
        ` : `
          <div class="warning-box">
            <strong>No card templates found</strong>
            Create a <code>reusable-card-parent</code> card first to define a template.
          </div>
        `}
      </div>
    `;

    const hashSelect = this.shadowRoot.getElementById('hash-select');
    hashSelect?.addEventListener('change', this._hashChanged.bind(this));
  }
}

// ============================================================================
// REGISTER COMPONENTS
// ============================================================================

customElements.define('reusable-card-parent', ReusableCardParent);
customElements.define('reusable-card-parent-editor', ReusableCardParentEditor);
customElements.define('reusable-card-child', ReusableCardChild);
customElements.define('reusable-card-child-editor', ReusableCardChildEditor);

// Register with Home Assistant card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'reusable-card-parent',
  name: 'Reusable Card Parent',
  description: 'Define a reusable card template',
  preview: true,
  documentationURL: 'https://github.com/deergitseason/reusable-cards',
});
window.customCards.push({
  type: 'reusable-card-child',
  name: 'Reusable Card Child',
  description: 'Display a saved card template',
  preview: false,
  documentationURL: 'https://github.com/deergitseason/reusable-cards',
});

console.info(
  `%c REUSABLE-CARDS %c v${CARD_VERSION} `,
  'color: white; background: #3498db; font-weight: bold;',
  'color: #3498db; background: white; font-weight: bold;'
);