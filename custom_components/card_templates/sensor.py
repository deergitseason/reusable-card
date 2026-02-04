"""Sensor platform for Reusable Card Templates."""
import logging
from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType

DOMAIN = "card_templates"

_LOGGER = logging.getLogger(__name__)


async def async_setup_platform(
    hass: HomeAssistant,
    config: ConfigType,
    async_add_entities: AddEntitiesCallback,
    discovery_info: DiscoveryInfoType = None,
) -> None:
    """Set up the Reusable Card Templates sensor."""
    async_add_entities([CardTemplatesSensor(hass)], True)


class CardTemplatesSensor(SensorEntity):
    """Sensor that exposes card templates as attributes."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._attr_name = "Card Templates"
        self._attr_unique_id = f"{DOMAIN}_sensor"
        self._attr_icon = "mdi:card-multiple"
        
    @property
    def state(self):
        """Return the state of the sensor."""
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        return len(cards)
    
    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        cards = self.hass.data.get(DOMAIN, {}).get("cards", {})
        return {
            "cards": cards,
            "hashes": list(cards.keys())
        }
    
    async def async_added_to_hass(self) -> None:
        """Register callbacks."""
        @callback
        def card_updated(event):
            """Handle card updated event."""
            self.async_schedule_update_ha_state(True)
        
        self.hass.bus.async_listen(f"{DOMAIN}_updated", card_updated)