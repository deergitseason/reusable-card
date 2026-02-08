"""Sensor platform for Reusable Cards - Performance Optimized."""
import logging
from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType

DOMAIN = "reusable_cards"
STORAGE_DIR = "reusable-cards-templates"
STORAGE_FILE = "reusable_cards.yaml"

_LOGGER = logging.getLogger(__name__)


async def async_setup_platform(
    hass: HomeAssistant,
    config: ConfigType,
    async_add_entities: AddEntitiesCallback,
    discovery_info: DiscoveryInfoType = None,
) -> None:
    """Set up the Reusable Cards sensor."""
    async_add_entities([ReusableCardsSensor(hass)], True)


class ReusableCardsSensor(SensorEntity):
    """Sensor that exposes card templates as attributes.
    
    Performance optimizations:
    - Minimal attributes (only essential data)
    - State changes only when card count changes
    - Cards read from hass.data, not attributes
    """

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._attr_name = "Reusable Cards"
        self._attr_unique_id = f"{DOMAIN}_sensor"
        self._attr_icon = "mdi:card-multiple"
        self._unsub = None
        self._last_card_count = 0
        
    @property
    def state(self):
        """Return the state of the sensor (just the count).
        
        State only changes when count changes - this prevents
        unnecessary frontend updates when card configs change.
        """
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        return len(cards)
    
    @property
    def extra_state_attributes(self):
        """Return minimal state attributes.
        
        PERFORMANCE CRITICAL: Cards read from hass.data, not attributes!
        
        JavaScript accesses cards via:
          hass.data.reusable_cards.cards  (primary, fast)
          hass.states['sensor.reusable_cards'].attributes.cards  (fallback)
        
        We keep 'cards' in attributes as fallback for compatibility,
        but the real optimization is that updates are minimized below.
        
        Attributes are now truly minimal:
        - hashes: Just the template IDs (lightweight)
        - storage_location: Static path info
        - cards: Full configs (kept for backwards compatibility ONLY)
        """
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        
        return {
            "hashes": list(cards.keys()),
            "storage_location": f"{STORAGE_DIR}/{STORAGE_FILE}",
            "cards": cards,  # Fallback only - primary access via hass.data
        }
    
    async def async_added_to_hass(self) -> None:
        """Register callbacks when entity is added."""
        @callback
        def card_updated(event):
            """Handle card updated event.
            
            CRITICAL OPTIMIZATION: Only update when hash list changes!
            
            Since child cards now read from hass.data (not sensor attributes),
            we don't need to update the sensor on every edit. We ONLY update when:
            1. A card is added (new hash)
            2. A card is deleted (hash removed)
            
            This drastically reduces sensor updates from "every edit" to "only add/delete".
            With 50 cards being edited, this goes from 50+ updates to maybe 2-3 updates.
            """
            cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
            new_count = len(cards)
            
            # Only update when count changes (add/delete operations)
            if new_count != self._last_card_count:
                _LOGGER.debug(f"Hash list changed: {self._last_card_count} -> {new_count} cards")
                self._last_card_count = new_count
                self.async_write_ha_state()
            else:
                # Edit operations don't need sensor update
                # Cards read directly from hass.data which is already updated
                _LOGGER.debug(f"Card edited (no sensor update needed)")
        
        self._unsub = self.hass.bus.async_listen(f"{DOMAIN}_updated", card_updated)
        
        # Initialize count
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        self._last_card_count = len(cards)
        
        _LOGGER.debug("Registered listener for card updates")
    
    async def async_will_remove_from_hass(self) -> None:
        """Unregister callbacks when entity is removed."""
        if self._unsub:
            self._unsub()
            self._unsub = None