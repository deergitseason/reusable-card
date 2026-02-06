"""Sensor platform for Reusable Cards."""
import logging
import time
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
    """Sensor that exposes card templates as attributes."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._attr_name = "Reusable Cards"
        self._attr_unique_id = f"{DOMAIN}_sensor"
        self._attr_icon = "mdi:card-multiple"
        self._unsub = None
        self._update_counter = 0
        
    @property
    def state(self):
        """Return the state of the sensor.
        
        Include update counter to force state change on every update,
        ensuring frontend receives attribute changes.
        """
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        # Format: "count.version" - this ensures state changes even when count doesn't
        return f"{len(cards)}.{self._update_counter}"
    
    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        
        # Calculate storage info
        import json
        cards_json = json.dumps(cards)
        size = len(cards_json)
        
        return {
            "cards": cards,
            "hashes": list(cards.keys()),
            "last_updated": time.time(),
            "storage_type": "yaml",
            "storage_location": f"{STORAGE_DIR}/{STORAGE_FILE}",
            "total_size_bytes": size,
        }
    
    async def async_added_to_hass(self) -> None:
        """Register callbacks when entity is added."""
        @callback
        def card_updated(event):
            """Handle card updated event."""
            _LOGGER.debug(f"Card updated event received: {event.data}")
            self._update_counter += 1
            self.async_write_ha_state()
        
        self._unsub = self.hass.bus.async_listen(f"{DOMAIN}_updated", card_updated)
        _LOGGER.debug("Registered listener for card updates")
    
    async def async_will_remove_from_hass(self) -> None:
        """Unregister callbacks when entity is removed."""
        if self._unsub:
            self._unsub()
            self._unsub = None