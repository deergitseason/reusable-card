"""Reusable Card Templates Integration for Home Assistant."""
import logging
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers import storage

DOMAIN = "reusable_cards"
STORAGE_KEY = f"{DOMAIN}.cards"
STORAGE_VERSION = 1

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Reusable Card Templates integration."""
    store = storage.Store(hass, STORAGE_VERSION, STORAGE_KEY)
    
    # Load existing card templates or initialize empty dict
    cards = await store.async_load() or {}
    
    # Store in hass.data for access by cards
    hass.data[DOMAIN] = {
        "store": store,
        "cards": cards
    }
    
    async def handle_save_card(call: ServiceCall) -> None:
        """Handle save_card service call."""
        card_hash = call.data.get("hash")
        card_config = call.data.get("config")
        
        if not card_hash or not card_config:
            _LOGGER.error("hash and config are required")
            return
        
        hass.data[DOMAIN]["cards"][card_hash] = card_config
        await store.async_save(hass.data[DOMAIN]["cards"])
        
        # Fire event to notify cards
        hass.bus.async_fire(f"{DOMAIN}_updated", {"hash": card_hash})
        
        _LOGGER.info(f"Saved card: {card_hash}")
    
    async def handle_delete_card(call: ServiceCall) -> None:
        """Handle delete_card service call."""
        card_hash = call.data.get("hash")
        
        if not card_hash:
            _LOGGER.error("hash is required")
            return
        
        if card_hash in hass.data[DOMAIN]["cards"]:
            del hass.data[DOMAIN]["cards"][card_hash]
            await store.async_save(hass.data[DOMAIN]["cards"])
            
            # Fire event to notify cards
            hass.bus.async_fire(f"{DOMAIN}_updated", {"hash": card_hash, "deleted": True})
            
            _LOGGER.info(f"Deleted card: {card_hash}")
    
    # Register services
    hass.services.async_register(DOMAIN, "save_card", handle_save_card)
    hass.services.async_register(DOMAIN, "delete_card", handle_delete_card)
    
    # Create sensor platform
    from homeassistant.helpers import discovery

    hass.async_create_task(
        discovery.async_load_platform(hass, "sensor", DOMAIN, {}, config)
    )
    
    return True