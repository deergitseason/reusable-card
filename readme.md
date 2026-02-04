# Home Assistant Reusable Cards

Define a card once, use it everywhere.

## Installation via HACS

### Step 1: Install Integration (Backend)
1. Open HACS → Integrations
2. Click three dots (⋮) → Custom repositories
3. Add repository URL: `https://github.com/yourusername/ha-reusable-cards`
4. Category: **Integration**
5. Click "Add"
6. Find "Card Templates" and click "Download"
7. **Restart Home Assistant**

### Step 2: Install Frontend Cards
1. Open HACS → Frontend
2. Click three dots (⋮) → Custom repositories
3. Add repository URL: `https://github.com/yourusername/ha-reusable-cards` (same URL)
4. Category: **Lovelace**
5. Click "Add"
6. Find "Reusable Cards" and click "Download"
7. Refresh browser (Ctrl+F5)

## Manual Installation

1. Copy `custom_components/card_templates` to your HA config
2. Restart Home Assistant
3. Copy files from `dist/` to `config/www/community/reusable-cards/`
4. Add resources in Lovelace:
   - `/hacsfiles/reusable-cards/reusable-card-parent.js`
   - `/hacsfiles/reusable-cards/reusable-card-child.js`
5. Refresh browser

## Usage

### Parent Card (visible, defines the template)
```yaml
type: custom:reusable-card-parent
hash: "#camera"
card:
  type: entities
  entities:
    - sun.sun
```

### Child Card (references the parent)
```yaml
type: custom:reusable-card-child
hash: "#camera"
```

The parent card displays normally and saves its config. Child cards render the same card anywhere.
```

## Final Structure

Your repo should look like:
```
ha-reusable-cards/
├── custom_components/
│   └── card_templates/
│       ├── __init__.py
│       ├── manifest.json
│       ├── sensor.py          ← FIX: Move up one level
│       └── services.yaml      ← FIX: Move up one level
├── dist/
│   ├── reusable-card-parent.js
│   └── reusable-card-child.js
├── hacs.json
├── README.md
└── .gitignore