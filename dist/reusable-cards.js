// Reusable Cards for Home Assistant
const CARD_VERSION = '1.4.1';

// Shared styles
const WATERMARK_STYLE = `
  .hash-overlay {
    position: absolute;
    bottom: 6px;
    right: 6px;
    font-size: 9px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.3);
    padding: 1px 4px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 999;
    line-height: 1;
    cursor: help;
  }
  .hash-overlay::after {
    content: attr(data-hash);
    position: absolute;
    bottom: 100%;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    margin-bottom: 4px;
  }
  .hash-overlay:hover::after {
    opacity: 1;
  }
`;

const CARD_WRAPPER_STYLE = `
  :host { display: block; position: relative; }
  .card-wrapper { position: relative; display: block; }
  .card-wrapper > *:first-child { display: block; width: 100%; }
`;

const EDITOR_BASE_STYLE = `
  :host { display: block; }
  .container { padding: 16px; }
  .info-box {
    background: var(--secondary-background-color);
    padding: 12px 16px;
    border-radius: var(--ha-card-border-radius, 12px);
    margin-bottom: 16px;
  }
  .info-box strong { color: var(--primary-text-color); }
  .info-box p { margin: 8px 0 0 0; color: var(--secondary-text-color); font-size: 0.9em; }
  .form-row { margin-bottom: 16px; }
  .form-row label { display: block; font-weight: 500; margin-bottom: 8px; color: var(--primary-text-color); }
  .form-row .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; }
  .form-row .helper-text code {
    background: var(--secondary-background-color);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .checkbox-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
  .checkbox-row label { font-size: 14px; color: var(--primary-text-color); cursor: pointer; }
`;

// Helpers
const getCardHelpers = async () => window.loadCardHelpers ? await window.loadCardHelpers() : null;

const getLovelace = () => {
  const root = document.querySelector('home-assistant');
  return root?.shadowRoot?.querySelector('home-assistant-main')?.shadowRoot?.querySelector('ha-panel-lovelace')?.lovelace;
};

const getViewFromURL = () => {
  const match = window.location.pathname.match(/\/[^\/]+\/([^\/]+)$/);
  return match?.[1] || null;
};

const getViewName = (lovelace) => {
  const fromURL = getViewFromURL();
  if (fromURL) return fromURL;
  
  const views = lovelace?.config?.views || lovelace?.views;
  const view = views?.[lovelace?.current_view ?? 0];
  return view?.path || view?.title?.toLowerCase().replace(/\s+/g, '-') || 'default';
};

const isEditMode = () => {
  const lovelace = getLovelace();
  return lovelace?.editMode === true;
};

// Strip visibility conditions from config recursively
// Handles all nested structures: cards, badges, elements, tabs, etc.
const stripVisibility = (config) => {
  // Handle null, undefined, or non-objects
  if (!config || typeof config !== 'object') return config;
  
  // Handle arrays
  if (Array.isArray(config)) {
    return config.map(item => stripVisibility(item));
  }
  
  // Create a shallow copy of the object
  const cleaned = { ...config };
  
  // Remove visibility and conditional properties at this level
  delete cleaned.visibility;
  delete cleaned.conditions;
  
  // Recursively clean all array properties that might contain nested configs
  // Common properties: cards, badges, elements, tabs, entities, rows, columns, etc.
  const arrayProperties = [
    'cards', 'badges', 'elements', 'tabs', 'entities', 
    'rows', 'columns', 'items', 'sections', 'views'
  ];
  
  for (const prop of arrayProperties) {
    if (cleaned[prop] && Array.isArray(cleaned[prop])) {
      cleaned[prop] = cleaned[prop].map(item => stripVisibility(item));
    }
  }
  
  // Also recursively clean nested objects (for custom structures)
  for (const key in cleaned) {
    if (cleaned[key] && typeof cleaned[key] === 'object' && !Array.isArray(cleaned[key])) {
      // Skip certain keys that shouldn't be recursively processed
      const skipKeys = ['hass', 'config', 'lovelace', 'stateObj'];
      if (!skipKeys.includes(key)) {
        cleaned[key] = stripVisibility(cleaned[key]);
      }
    }
  }
  
  return cleaned;
};

const createCardElement = async (config, forceEditMode = false) => {
  const helpers = await getCardHelpers();
  
  // If in edit mode, strip visibility conditions
  const cleanedConfig = forceEditMode ? stripVisibility(config) : config;
  
  let card;
  if (helpers) {
    card = helpers.createCardElement(cleanedConfig);
  } else {
    const tagName = cleanedConfig.type?.startsWith('custom:') 
      ? cleanedConfig.type.replace('custom:', '') 
      : `hui-${cleanedConfig.type}-card`;
    card = document.createElement(tagName);
    card.setConfig?.(cleanedConfig);
  }
  
  return card;
};

const searchShadowDOM = (root, selector, callback) => {
  if (!root) return;
  root.querySelectorAll?.(selector)?.forEach(callback);
  root.querySelectorAll?.('*')?.forEach(el => {
    if (el.shadowRoot) searchShadowDOM(el.shadowRoot, selector, callback);
  });
};

// ============================================================================
// REUSABLE CARD PARENT
// ============================================================================

class ReusableCardParent extends HTMLElement {
  static _cleanupScheduled = false;
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._cardElement = null;
    this._savedConfigHash = null;
    this._pendingSave = false;
    this._previousHash = null;
    this._lastEditMode = null;
    this._editModeCheckInterval = null;
  }

  setConfig(config) {
    if (!config.hash) throw new Error('You must specify a hash');
    if (config._previousHash) this._previousHash = config._previousHash;
    this._config = config;
    config.card ? this.createCard() : this.showPlaceholder();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Check if edit mode changed
    const currentEditMode = isEditMode();
    if (this._lastEditMode !== currentEditMode) {
      this._lastEditMode = currentEditMode;
      // Recreate card to apply/remove edit mode
      if (this._config.card) {
        this.createCard();
      }
    } else if (this._cardElement) {
      // Just update hass if edit mode hasn't changed
      this._cardElement.hass = hass;
    }
    
    if (this._config.hash && this._config.card) {
      this._pendingSave = true;
      this._trySave();
    }
  }

  connectedCallback() {
    if (this._pendingSave) requestAnimationFrame(() => this._trySave());
    if (!ReusableCardParent._cleanupScheduled) {
      ReusableCardParent._cleanupScheduled = true;
      setTimeout(() => {
        this._cleanupOrphanedHashes();
        ReusableCardParent._cleanupScheduled = false;
      }, 2000);
    }
    
    // Poll for edit mode changes
    this._editModeCheckInterval = setInterval(() => {
      if (this._hass) {
        const currentEditMode = isEditMode();
        if (this._lastEditMode !== currentEditMode) {
          this._lastEditMode = currentEditMode;
          if (this._config.card) {
            this.createCard();
          }
        }
      }
    }, 500);
  }

  disconnectedCallback() {
    if (this._editModeCheckInterval) {
      clearInterval(this._editModeCheckInterval);
      this._editModeCheckInterval = null;
    }
    
    // When card is removed from DOM, schedule cleanup to remove orphaned hash
    if (this._hass && this._config.hash) {
      setTimeout(() => {
        this._cleanupOrphanedHashes();
      }, 1000);
    }
  }

  _trySave() {
    if (!this._pendingSave || !this.isConnected || !this.parentElement || this._isPreview()) return;
    this._pendingSave = false;
    this._saveToStorage();
  }

  _isPreview() {
    const ha = document.querySelector('home-assistant');
    const dialog = ha?.shadowRoot?.querySelector('hui-dialog-edit-card, hui-dialog-create-card');
    if (dialog?.shadowRoot?.querySelector('ha-dialog[open]')) return true;
    
    let node = this.parentElement;
    while (node) {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'hui-dialog-edit-card' || tag === 'hui-dialog-create-card') return true;
      if (tag === 'home-assistant-main') return false;
      node = node.parentElement;
    }
    return false;
  }

  async _saveToStorage() {
    if (!this._hass || !this._config.hash || !this._config.card) return;
    
    const configHash = JSON.stringify({ hash: this._config.hash, card: this._config.card });
    if (configHash === this._savedConfigHash) return;

    try {
      if (this._previousHash && this._previousHash !== this._config.hash) {
        await this._hass.callService('reusable_cards', 'delete_card', { hash: this._previousHash });
        this._previousHash = null;
      }
      await this._hass.callService('reusable_cards', 'save_card', {
        hash: this._config.hash,
        config: this._config.card
      });
      this._savedConfigHash = configHash;
      await this._cleanupOrphanedHashes();
    } catch (e) { console.error('[ReusableCards] Save error:', e); }
  }

  async _cleanupOrphanedHashes() {
    if (!this._hass) return setTimeout(() => this._cleanupOrphanedHashes(), 500);
    
    // Don't cleanup if dashboard is in YAML edit mode - cards are temporarily removed from DOM
    const ha = document.querySelector('home-assistant');
    const lovelacePanel = ha?.shadowRoot?.querySelector('home-assistant-main')?.shadowRoot?.querySelector('ha-panel-lovelace');
    const editDialog = lovelacePanel?.shadowRoot?.querySelector('hui-dialog-edit-view');
    if (editDialog?.shadowRoot?.querySelector('ha-dialog[open]')) {
      console.log('[ReusableCards] Skipping cleanup - YAML edit mode active');
      return;
    }
    
    const currentView = getViewFromURL();
    if (!currentView) return;
    
    const sensor = this._hass.states['sensor.reusable_cards'];
    const storedHashes = sensor?.attributes?.hashes || [];
    const viewSuffix = `.${currentView}`;
    const hashesForView = storedHashes.filter(h => h.endsWith(viewSuffix));
    if (!hashesForView.length) return;
    
    const activeHashes = new Set();
    searchShadowDOM(document, 'reusable-card-parent', el => {
      if (el._config?.hash) activeHashes.add(el._config.hash);
    });
    
    const orphanedHashes = hashesForView.filter(h => !activeHashes.has(h));
    
    // Safety check: If we're about to delete ALL hashes for this view, something is probably wrong
    // This prevents accidental deletion when cards are temporarily removed (YAML mode, etc.)
    if (orphanedHashes.length > 0 && orphanedHashes.length === hashesForView.length && hashesForView.length > 1) {
      console.warn('[ReusableCards] Refusing to delete ALL hashes - this might be YAML edit mode or a bug');
      return;
    }
    
    if (orphanedHashes.length > 0) {
      console.log('[ReusableCards] Found orphaned hashes:', orphanedHashes);
      for (const hash of orphanedHashes) {
        try { await this._hass.callService('reusable_cards', 'delete_card', { hash }); } catch {}
      }
    }
  }

  async createCard() {
    if (!this._config.card) return;
    try {
      const editMode = isEditMode();
      this._cardElement = await createCardElement(this._config.card, editMode);
      if (this._hass) {
        this._cardElement.hass = this._hass;
      }
      
      const showWatermark = this._config.show_watermark !== false;
      this.shadowRoot.innerHTML = `
        <style>${CARD_WRAPPER_STYLE}${WATERMARK_STYLE}</style>
        <div class="card-wrapper"></div>
        ${showWatermark ? `<span class="hash-overlay" data-hash="${this._config.hash}" title="${this._config.hash}">p</span>` : ''}
      `;
      this.shadowRoot.querySelector('.card-wrapper').appendChild(this._cardElement);
    } catch (e) { this.showError(e.message); }
  }

  showError(msg) {
    this.shadowRoot.innerHTML = `<ha-card><div style="background:var(--error-color);color:white;padding:16px;border-radius:4px"><strong>Error</strong><br>${msg}</div></ha-card>`;
  }

  showPlaceholder() {
    this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px;text-align:center;color:var(--secondary-text-color)">Select a card type in the editor.</div></ha-card>`;
  }

  getCardSize() { return this._cardElement?.getCardSize?.() || 3; }
  static getConfigElement() { return document.createElement('reusable-card-parent-editor'); }
  static getStubConfig() { return { type: 'custom:reusable-card-parent', hash: '#my-card' }; }
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
    this._initialHash = null;
  }

  setConfig(config) {
    if (this._initialHash === null && config.hash) this._initialHash = config.hash;
    this._config = { ...config };
    
    // If it's a brand new card, default it to a stack to force the editor to load
    if (!this._config.card) {
      this._config.card = { type: "vertical-stack", cards: [] };
    }
    
    // If no hash exists, generate default with view name
    if (!this._config.hash) {
      const currentView = getViewName(this.lovelace);
      this._config.hash = `#my-card.${currentView}`;
      this._configChanged(this._config);
    }
    
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll('hui-card-element-editor, hui-card-picker')?.forEach(el => el.hass = hass);
    if (!this.shadowRoot?.hasChildNodes()) this._render();
  }

  set lovelace(l) { this._lovelace = l; }
  get lovelace() { return this._lovelace || getLovelace(); }

  _configChanged(config) {
    config.type = 'custom:reusable-card-parent';
    if (this._initialHash && this._initialHash !== config.hash) config._previousHash = this._initialHash;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  async _render() {
    if (!this._hass) return;
    
    const hasCard = this._config.card?.type;
    const currentView = getViewName(this.lovelace);
    let hashName = (this._config.hash || '').replace(/^#/, '');
    const dotIdx = hashName.lastIndexOf('.');
    if (dotIdx > 0) hashName = hashName.substring(0, dotIdx);

    this.shadowRoot.innerHTML = `
      <style>
        ${EDITOR_BASE_STYLE}
        .hash-input-wrapper {
          display: flex;
          align-items: center;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 8px);
          background: var(--card-background-color, var(--ha-card-background));
          overflow: hidden;
        }
        .hash-input-wrapper:focus-within { border-color: var(--primary-color); }
        .hash-prefix, .hash-suffix {
          padding: 12px 8px;
          color: var(--secondary-text-color);
          font-size: 14px;
          font-family: monospace;
          background: var(--secondary-background-color);
          user-select: none;
        }
        .hash-prefix { padding-right: 4px; }
        .hash-suffix { padding-left: 4px; }
        .hash-input-wrapper input {
          flex: 1;
          padding: 12px 4px;
          border: none;
          background: transparent;
          color: var(--primary-text-color);
          font-size: 14px;
          font-family: monospace;
          min-width: 80px;
        }
        .hash-input-wrapper input:focus { outline: none; }
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
        .card-section-header h3 { margin: 0; font-size: 14px; font-weight: 500; }
        .card-section-content { padding: 16px; min-height: 100px; }
      </style>
      <div class="container">
        <div class="info-box">
          <strong>Reusable Card Parent</strong>
          <p>Define a card template that can be reused with child cards.</p>
        </div>
        <div class="form-row">
          <label>Template Hash</label>
          <div class="hash-input-wrapper">
            <span class="hash-prefix">#</span>
            <input type="text" id="hash-input" value="${hashName}" placeholder="my-card"/>
            <span class="hash-suffix">.${currentView}</span>
          </div>
          <div class="helper-text">Full hash: <code>#${hashName || 'my-card'}.${currentView}</code></div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="watermark-cb" ${this._config.show_watermark !== false ? 'checked' : ''}/>
          <label for="watermark-cb">Show watermark</label>
        </div>
        <div class="card-section">
          <div class="card-section-header">
            <h3>Card Configuration</h3>
            ${hasCard ? `<div style="font-size: 12px; color: var(--secondary-text-color); font-style: italic;">
              Note: Leave "Title" field below empty
            </div>` : ''}
          </div>
          <div class="card-section-content" id="editor-container"></div>
        </div>
      </div>
    `;

    const $ = id => this.shadowRoot.getElementById(id);
    $('hash-input')?.addEventListener('change', e => {
      let name = e.target.value.trim().replace(/^#/, '').split('.')[0];
      this._config = { ...this._config, hash: name ? `#${name}.${currentView}` : '' };
      this._configChanged(this._config);
    });
    $('watermark-cb')?.addEventListener('change', e => {
      this._config = { ...this._config, show_watermark: e.target.checked };
      this._configChanged(this._config);
    });

    await this._renderCardEditor();
  }

  async _renderCardEditor() {
    const container = this.shadowRoot.getElementById('editor-container');
    if (!container || !this._hass) return;
    
    // Show loading while we verify element registration
    container.innerHTML = '<div style="display:flex; justify-content:center; padding:20px;"><ha-circular-progress active size="small"></ha-circular-progress></div>';

    if (this._config.card?.type && this._config.card.type !== "") {
      await this._loadElement('hui-card-element-editor');
      const editor = document.createElement('hui-card-element-editor');
      editor.hass = this._hass;
      editor.lovelace = this.lovelace;
      editor.value = this._config.card;
      editor.addEventListener('config-changed', e => {
        e.stopPropagation();
        this._config = { ...this._config, card: e.detail.config };
        this._configChanged(this._config);
      });
      container.innerHTML = '';
      container.appendChild(editor);
    } else {
      await this._loadElement('hui-card-picker');
      if (customElements.get('hui-card-picker')) {
        const picker = document.createElement('hui-card-picker');
        picker.hass = this._hass;
        picker.lovelace = this.lovelace;
        picker.addEventListener('config-changed', e => {
          e.stopPropagation();
          this._config = { ...this._config, card: e.detail.config };
          this._configChanged(this._config);
        });
        container.innerHTML = '';
        container.appendChild(picker);
      } else {
        container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--secondary-text-color)">
          <p>Card picker could not be loaded.</p>
          <p style="font-size:12px">Try refreshing the page or add the card configuration manually via YAML.</p>
        </div>`;
      }
    }
  }

  async _loadElement(tag) {
    if (customElements.get(tag)) return;
    
    // Try to trigger HA's internal lazy-loader for dashboard elements
    try {
      const helpers = await getCardHelpers();
      if (helpers) {
        // Creating a generic element often triggers the registry to populate
        helpers.createCardElement({ type: 'button', entity: '' });
      }
    } catch (e) {}
    
    // Poll for registration with a longer timeout (5s)
    const end = Date.now() + 5000;
    while (!customElements.get(tag) && Date.now() < end) {
      await new Promise(r => setTimeout(r, 100));
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
    this._lastEditMode = null;
    this._editModeCheckInterval = null;
  }

  setConfig(config) {
    if (!config.hash) throw new Error('You must specify a hash');
    this._config = config;
    this._lastCardConfig = null;
    this.createCard();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Check if edit mode changed
    const currentEditMode = isEditMode();
    const editModeChanged = this._lastEditMode !== currentEditMode;
    if (editModeChanged) {
      this._lastEditMode = currentEditMode;
    }
    
    const cards = hass.states['sensor.reusable_cards']?.attributes?.cards || {};
    const configJson = JSON.stringify(cards[this._config.hash]);
    
    // Recreate card if config changed OR edit mode changed
    if (configJson !== this._lastCardConfig || editModeChanged) {
      this.createCard();
    } else if (this._cardElement) {
      this._cardElement.hass = hass;
    }
  }

  connectedCallback() {
    // Poll for edit mode changes
    this._editModeCheckInterval = setInterval(() => {
      if (this._hass) {
        const currentEditMode = isEditMode();
        if (this._lastEditMode !== currentEditMode) {
          this._lastEditMode = currentEditMode;
          this.createCard();
        }
      }
    }, 500);
  }

  disconnectedCallback() {
    if (this._editModeCheckInterval) {
      clearInterval(this._editModeCheckInterval);
      this._editModeCheckInterval = null;
    }
  }

  async createCard() {
    if (!this._hass || !this._config.hash) return;
    
    const sensor = this._hass.states['sensor.reusable_cards'];
    if (!sensor?.attributes?.cards) {
      return this.showError('Reusable Cards integration not found.');
    }
    
    const cardConfig = sensor.attributes.cards[this._config.hash];
    if (!cardConfig) {
      this._lastCardConfig = null;
      return this.showError(`Template "${this._config.hash}" not found.`);
    }

    const configJson = JSON.stringify(cardConfig);
    const editMode = isEditMode();
    
    // Only skip recreation if config AND edit mode are both unchanged
    if (configJson === this._lastCardConfig && this._lastEditMode === editMode && this._cardElement) {
      return;
    }

    try {
      this._cardElement = await createCardElement(cardConfig, editMode);
      this._cardElement.hass = this._hass;
      this._lastCardConfig = configJson;
      this._lastEditMode = editMode;
      
      const showWatermark = this._config.show_watermark !== false;
      this.shadowRoot.innerHTML = `
        <style>${CARD_WRAPPER_STYLE}${WATERMARK_STYLE}</style>
        <div class="card-wrapper"></div>
        ${showWatermark ? `<span class="hash-overlay" data-hash="${this._config.hash}" title="${this._config.hash}">c</span>` : ''}
      `;
      this.shadowRoot.querySelector('.card-wrapper').appendChild(this._cardElement);
    } catch (e) { this.showError(e.message); }
  }

  showError(msg) {
    this.shadowRoot.innerHTML = `<ha-card><div style="background:var(--error-color);color:white;padding:16px;border-radius:4px"><strong>Error</strong><br>${msg}</div></ha-card>`;
  }

  getCardSize() { return this._cardElement?.getCardSize?.() || 3; }
  static getConfigElement() { return document.createElement('reusable-card-child-editor'); }
  static getStubConfig() { return { type: 'custom:reusable-card-child', hash: '#my-card' }; }
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

  setConfig(config) { this._config = config; this._render(); }

  set hass(hass) {
    const newHashes = Object.keys(hass?.states['sensor.reusable_cards']?.attributes?.cards || {}).join(',');
    if (this._lastHashes !== newHashes || !this.shadowRoot?.hasChildNodes()) {
      this._hass = hass;
      this._lastHashes = newHashes;
      this._render();
    } else {
      this._hass = hass;
    }
  }

  _configChanged(config) {
    config.type = 'custom:reusable-card-child';
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this._hass) return;
    
    const cards = this._hass.states['sensor.reusable_cards']?.attributes?.cards || {};
    const hashes = Object.keys(cards);
    const currentHash = this._config.hash || '';
    
    const groups = {};
    hashes.forEach(hash => {
      const dotIdx = hash.lastIndexOf('.');
      const view = dotIdx > 0 ? hash.substring(dotIdx + 1) : '_global';
      const name = dotIdx > 0 ? hash.substring(0, dotIdx) : hash;
      (groups[view] = groups[view] || []).push({ hash, name });
    });
    const sortedViews = Object.keys(groups).sort((a, b) => a === '_global' ? -1 : b === '_global' ? 1 : a.localeCompare(b));

    this.shadowRoot.innerHTML = `
      <style>
        ${EDITOR_BASE_STYLE}
        .form-row select {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 8px);
          background: var(--card-background-color, var(--ha-card-background));
          color: var(--primary-text-color);
          font-size: 14px;
          cursor: pointer;
        }
        .form-row select:focus { outline: none; border-color: var(--primary-color); }
        .warning-box {
          background: var(--warning-color);
          color: var(--primary-text-color);
          padding: 16px;
          border-radius: var(--ha-card-border-radius, 12px);
          text-align: center;
        }
      </style>
      <div class="container">
        <div class="info-box">
          <strong>Reusable Card Child</strong>
          <p>Display a card template defined with a parent card.</p>
        </div>
        ${hashes.length ? `
          <div class="form-row">
            <label>Select Card Template</label>
            <select id="hash-select">
              <option value="" ${!currentHash ? 'selected' : ''}>-- Select a template --</option>
              ${sortedViews.map(view => `
                <optgroup label="${view === '_global' ? 'Global' : 'View: ' + view}">
                  ${groups[view].map(item => `<option value="${item.hash}" ${currentHash === item.hash ? 'selected' : ''}>${item.name}</option>`).join('')}
                </optgroup>
              `).join('')}
            </select>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="watermark-cb" ${this._config.show_watermark !== false ? 'checked' : ''}/>
            <label for="watermark-cb">Show watermark</label>
          </div>
        ` : `<div class="warning-box"><strong>No templates found</strong><br>Create a reusable-card-parent first.</div>`}
      </div>
    `;

    this.shadowRoot.getElementById('hash-select')?.addEventListener('change', e => {
      this._config = { ...this._config, hash: e.target.value };
      this._configChanged(this._config);
    });
    this.shadowRoot.getElementById('watermark-cb')?.addEventListener('change', e => {
      this._config = { ...this._config, show_watermark: e.target.checked };
      this._configChanged(this._config);
    });
  }
}

// Register components
customElements.define('reusable-card-parent', ReusableCardParent);
customElements.define('reusable-card-parent-editor', ReusableCardParentEditor);
customElements.define('reusable-card-child', ReusableCardChild);
customElements.define('reusable-card-child-editor', ReusableCardChildEditor);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: 'reusable-card-parent', name: 'Reusable Card Parent', description: 'Define a reusable card template', preview: true },
  { type: 'reusable-card-child', name: 'Reusable Card Child', description: 'Display a saved card template', preview: false }
);

console.info(`%c REUSABLE-CARDS %c v${CARD_VERSION} `, 'color:white;background:#3498db;font-weight:bold', 'color:#3498db;background:white;font-weight:bold');