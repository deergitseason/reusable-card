# Home Assistant Reusable Cards

Define a card once, use it everywhere.

## Installation

1. Copy `custom_components/card_templates` to your HA config
2. Restart Home Assistant
3. Copy `reusable-card-parent.js` and `reusable-card-child.js` to `config/www/`
4. Add resources in Lovelace:
   - `/local/reusable-card-parent.js`
   - `/local/reusable-card-child.js`
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