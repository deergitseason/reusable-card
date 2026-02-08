# Home Assistant Reusable Cards

Define a card once, use it everywhere. Create reusable card templates that can be referenced across multiple dashboards and views.

## Features

- 🎨 **Visual Editor**: Full card editor with drag-and-drop support
- 🔄 **Reusable Templates**: Define once, use anywhere
- 📁 **YAML Storage**: Templates stored in `/config/reusable-cards-templates/reusable_cards.yaml`
- 👁️ **Smart Visibility**: Automatically handles visibility conditions in edit mode
- 🏷️ **View-Scoped**: Templates tagged with the dashboard view they're located in (so you can find them)
- 💾 **Auto-Backup**: Automatic `.bak` file creation on each save
- 🚫 **No Size Limits**: Store hundreds of templates without sensor attribute limits

## Installation

### Step 1: Install Backend Integration

#### Via HACS (Recommended)
1. Open **HACS** → **Integrations**
2. Click **⋮** (three dots) → **Custom repositories**
3. Add repository: `https://github.com/yourusername/reusable-cards`
4. Category: **Integration**
5. Click **Add**
6. Find "**Reusable Cards**" and click **Download**
7. **Restart Home Assistant**

#### Manual Installation
1. Copy `custom_components/reusable_cards` to your `/config/custom_components/` directory
2. Restart Home Assistant

### Step 2: Install Frontend Card

#### Manual Installation (Required)
1. Copy `dist/reusable-cards.js` to `/config/www/reusable-cards/`
2. Add to your Lovelace resources:

**Via UI:**
- Go to **Settings** → **Dashboards** → **⋮** (top right) → **Resources**
- Click **+ Add Resource**
- URL: `/hacsfiles/reusable-cards/reusable-cards.js`
- Type: **JavaScript Module**

**Via YAML:**
```yaml
resources:
  - url: /hacsfiles/reusable-cards/reusable-cards.js
    type: module
```

3. **Refresh your browser** (Ctrl+F5 or Cmd+Shift+R)

## Usage

### Creating a Template (Parent Card)

Add a **Reusable Card Parent** to your dashboard. This card is **visible** and defines the template.

**Via UI:**
1. Edit your dashboard
2. Add card → Search "Reusable Card Parent"
3. Configure the template hash (e.g., `camera`)
4. Add cards inside the vertical stack
5. Save

**Via YAML:**
```yaml
type: custom:reusable-card-parent
hash: "#camera.livingroom"
show_watermark: true
card:
  type: vertical-stack
  cards:
    - type: picture-entity
      entity: camera.front_door
    - type: button
      entity: light.porch
```


### Using a Template (Child Card)

Add a **Reusable Card Child** anywhere you want to display the template.

**Via UI:**
1. Edit your dashboard
2. Add card → Search "Reusable Card Child"
3. Select the template from dropdown
4. Save

**Via YAML:**
```yaml
type: custom:reusable-card-child
hash: "#camera.livingroom"
show_watermark: true
```

## How It Works

### Hash Naming Convention

Hashes follow the format: `#<n>.<view>`

- `#camera.livingroom` - Camera template on "livingroom" view
- `#sensors.dashboard` - Sensors template on "dashboard" view  
- `#lights.kitchen` - Lights template on "kitchen" view

The view name is **automatically appended** when you create a new parent card. This helps you **locate where the parent template lives** - if you need to edit `#camera.livingroom`, you know to look on the "livingroom" view/dashboard.

### Storage

Templates are stored in:
```
/config/reusable-cards-templates/
├── reusable_cards.yaml       # Your templates
└── reusable_cards.yaml.bak   # Automatic backup
```

Example `reusable_cards.yaml`:
```yaml
'#camera.livingroom':
  type: vertical-stack
  cards:
  - entity: camera.front_door
    type: picture-entity
  - entity: light.porch
    type: button

'#sensors.dashboard':
  type: entities
  entities:
  - sensor.temperature
  - sensor.humidity
```

### Sensor

The integration creates a `sensor.reusable_cards` entity that exposes:
- `cards`: All template configurations
- `hashes`: List of all template hashes
- `storage_type`: "yaml"
- `storage_location`: Path to storage file
- `total_size_bytes`: Size of all templates

## Advanced Features

### Visibility Conditions

Templates **respect visibility conditions** in normal view mode and **ignore them** in edit mode (just like native HA cards).

```yaml
type: custom:reusable-card-parent
hash: "#conditional.livingroom"
card:
  type: vertical-stack
  cards:
    - type: button
      entity: light.living_room
      visibility:
        - condition: state
          entity: sun.sun
          state: below_horizon
```

### Nested Structures

The integration handles deeply nested visibility conditions:
```yaml
card:
  type: vertical-stack
  cards:
    - type: custom:badge-horizontal-container-card
      badges:
        - type: custom:hui-entity-badge
          entity: sensor.temperature
          visibility:
            - condition: numeric_state
              entity: sensor.temperature
              above: 75
```

### Watermark

Each card shows a small watermark indicator:
- **p** = Parent card (defines template)
- **c** = Child card (references template)

Hover over the watermark to see the full hash. Disable with:
```yaml
show_watermark: false
```

## Services

### `reusable_cards.save_card`

Save a template programmatically.

```yaml
service: reusable_cards.save_card
data:
  hash: "#my-card.livingroom"
  config:
    type: entities
    entities:
      - light.living_room
```

### `reusable_cards.delete_card`

Delete a template.

```yaml
service: reusable_cards.delete_card
data:
  hash: "#my-card.livingroom"
```

## Tips & Best Practices

### Naming Templates

- Use descriptive names: `#camera-grid.frontdoor` instead of `#card1`
- Keep view names consistent with your dashboard paths
- Use lowercase with hyphens for readability

### Editing Templates

1. Edit the **parent card** - changes apply to all children automatically
2. **Note**: Leave the "Title" field empty in vertical stacks (it's for internal use)
3. Templates update in real-time across all views
4. **Important**: After creating or editing a parent card, refresh your browser (F5) if the template doesn't appear in the child card dropdown menu

### Parent Card Uses Vertical Stack

The parent card uses a `vertical-stack` by default to ensure the card picker works reliably in GUI mode. While technically optional, this prevents the card picker from disappearing in certain scenarios. You can still configure any card type inside the vertical stack.

### YAML Edit Mode

The integration automatically detects YAML edit mode and prevents accidental template deletion. You can safely use raw configuration editor without breaking templates.

### Backup & Version Control

- Templates are stored in human-readable YAML
- Automatic `.bak` files created on each save
- Add `/config/reusable-cards-templates/` to git for version control
- Exclude `.bak` files in `.gitignore`

## Troubleshooting

### Templates Not Showing Up

1. Check `sensor.reusable_cards` exists
2. Verify templates are in `/config/reusable-cards-templates/reusable_cards.yaml`
3. **Refresh your browser (F5)** - newly created templates may not appear in the child card dropdown until refresh
4. Hard refresh if needed (Ctrl+F5 or Cmd+Shift+R)

### Child Card Shows Error

- **"Template not found"**: The parent card doesn't exist or has a different hash
- **"Integration not found"**: Backend integration not loaded - restart HA

### Changes Not Applying

1. Make sure you're editing the **parent card**, not a child
2. Check browser console for errors (F12)
3. Verify the hash matches exactly between parent and children

### YAML Mode Clears Templates

This was a bug in earlier versions (< 1.4.1). Update to the latest version - it includes protections against this issue.

## Version History

- **1.4.1**: YAML file storage, improved edit mode detection, nested visibility support
- **1.3.2**: Edit mode visibility handling
- **1.2.0**: Watermark tooltips, view-scoped templates
- **1.1.0**: Initial release

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## License

MIT License - see LICENSE file for details

## Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/yourusername/reusable-cards/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/reusable-cards/discussions)
- 📖 **Wiki**: [GitHub Wiki](https://github.com/yourusername/reusable-cards/wiki)
