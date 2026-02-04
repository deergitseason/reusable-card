class ReusableCardChild extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
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
      
      if (this._cardElement) {
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
    
    // Handle built-in cards
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

    // Get available card hashes
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
      hashInput.addEventListener('change', (e) => {
        this._config = {
          ...this._config,
          hash: e.target.value
        };
        this.configChanged(this._config);
      });
    }
  }
}

customElements.define('reusable-card-child', ReusableCardChild);
customElements.define('reusable-card-child-editor', ReusableCardChildEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'reusable-card-child',
  name: 'Reusable Card Child',
  description: 'Display a saved card template',
  preview: false,
});