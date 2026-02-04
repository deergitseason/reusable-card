class ReusableCardParent extends HTMLElement {
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
    
    if (!config.card) {
      throw new Error('You must specify a card configuration');
    }
    
    this._config = config;
    this.createCard();
    this.saveToStorage();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Pass hass to the child card if it exists
    if (this._cardElement && this._cardElement.hass !== hass) {
      this._cardElement.hass = hass;
    }
    
    // Save to storage if not done yet
    if (!this._saved) {
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
      
      this._saved = true;
      console.log(`Saved card template: ${this._config.hash}`);
    } catch (error) {
      console.error('Error saving card template:', error);
    }
  }

  async createCard() {
    if (!this._config.card) return;

    try {
      const cardElement = await this.createCardElement(this._config.card);
      
      if (this._cardElement) {
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
      card: config.card || { type: 'entities', entities: [] }
    };
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
          This card displays normally AND saves its config for reuse. Configure the card below.
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

    this.attachEventListeners();
    this.renderCardEditor();
  }

  attachEventListeners() {
    const hashInput = this.shadowRoot.getElementById('hash');
    if (hashInput) {
      hashInput.addEventListener('change', (e) => {
        this._config.hash = e.target.value;
        this.configChanged(this._config);
      });
    }
  }

  async renderCardEditor() {
    const cardEditorContainer = this.shadowRoot.getElementById('card-editor');
    if (!cardEditorContainer) return;

    const cardConfig = this._config.card || { type: 'entities', entities: [] };
    
    // Create a proper card config editor element
    const GUIEditor = customElements.get('hui-card-element-editor');
    
    if (GUIEditor) {
      const editor = new GUIEditor();
      editor.hass = this._hass;
      editor.value = cardConfig;
      
      editor.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        // Update the nested card config, NOT the parent config
        this._config.card = ev.detail.value;
        // Emit the full parent config (with hash + card)
        this.configChanged(this._config);
      });
      
      cardEditorContainer.innerHTML = '';
      cardEditorContainer.appendChild(editor);
    } else {
      // Fallback to showing instructions if editor not available
      cardEditorContainer.innerHTML = `
        <div style="padding: 12px; background: var(--secondary-background-color); border-radius: 4px;">
          <p><strong>Card configuration:</strong></p>
          <p>Edit the parent card in YAML mode to configure the nested card.</p>
          <p>Current card type: <code>${cardConfig.type || 'none'}</code></p>
        </div>
      `;
    }
  }
}

customElements.define('reusable-card-parent', ReusableCardParent);
customElements.define('reusable-card-parent-editor', ReusableCardParentEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'reusable-card-parent',
  name: 'Reusable Card Parent',
  description: 'Define and display a reusable card',
  preview: true,
});