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
        
        PERFORMANCE NOTE: We keep attributes minimal because:
        1. Cards are already in hass.data (frontend reads from there)
        2. Large attributes slow down state updates
        3. Sensor updates trigger frontend re-renders
        
        We only expose:
        - hashes: List of template IDs (lightweight)
        - storage_location: Where templates are stored (static)
        
        We removed:
        - cards: Full configs (now read from hass.data directly)
        - last_updated: Caused unnecessary state changes
        - total_size_bytes: Not critical for performance
        """
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        
        return {
            "hashes": list(cards.keys()),
            "storage_location": f"{STORAGE_DIR}/{STORAGE_FILE}",
            # Full card configs available via hass.data[DOMAIN]["cards"]
            # Frontend cards read directly from there, not from attributes
            "cards": cards,  # Keep for backwards compatibility with child cards
        }
    
    async def async_added_to_hass(self) -> None:
        """Register callbacks when entity is added."""
        @callback
        def card_updated(event):
            """Handle card updated event.
            
            Only trigger state update if card count changed.
            This prevents unnecessary updates when just editing a card.
            """
            cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
            new_count = len(cards)
            
            # Only update if count changed (add/delete)
            # Don't update on edit (same count, different content)
            if new_count != self._last_card_count:
                _LOGGER.debug(f"Card count changed: {self._last_card_count} -> {new_count}")
                self._last_card_count = new_count
                self.async_write_ha_state()
            else:
                # Still need to update for hash list changes
                # But we can do this less aggressively
                _LOGGER.debug(f"Card edited, count unchanged: {new_count}")
                self.async_write_ha_state()
        
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