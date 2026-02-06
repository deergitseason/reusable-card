"""Reusable Card Templates Integration for Home Assistant."""
import logging
import os
import yaml
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol
from homeassistant.helpers import config_validation as cv

DOMAIN = "reusable_cards"
STORAGE_DIR = "reusable-cards-templates"
STORAGE_FILE = "reusable_cards.yaml"

_LOGGER = logging.getLogger(__name__)

# Service schemas
SAVE_CARD_SCHEMA = vol.Schema({
    vol.Required("hash"): cv.string,
    vol.Required("config"): dict,
})

DELETE_CARD_SCHEMA = vol.Schema({
    vol.Required("hash"): cv.string,
})


def _get_storage_dir(hass: HomeAssistant) -> str:
    """Get the path to the storage directory."""
    return hass.config.path(STORAGE_DIR)


def _get_yaml_path(hass: HomeAssistant) -> str:
    """Get the path to the YAML storage file."""
    return os.path.join(_get_storage_dir(hass), STORAGE_FILE)


def _ensure_storage_dir(hass: HomeAssistant) -> None:
    """Ensure the storage directory exists."""
    storage_dir = _get_storage_dir(hass)
    if not os.path.exists(storage_dir):
        os.makedirs(storage_dir)
        _LOGGER.info(f"Created storage directory: {storage_dir}")


def _load_cards(hass: HomeAssistant) -> dict:
    """Load cards from YAML file."""
    _ensure_storage_dir(hass)
    yaml_path = _get_yaml_path(hass)
    
    if not os.path.exists(yaml_path):
        _LOGGER.debug("YAML file does not exist, returning empty dict")
        return {}
    
    try:
        with open(yaml_path, 'r') as f:
            data = yaml.safe_load(f) or {}
            _LOGGER.debug(f"Loaded {len(data)} cards from YAML")
            return data
    except Exception as e:
        _LOGGER.error(f"Error loading YAML file: {e}")
        return {}


def _save_cards(hass: HomeAssistant, cards: dict) -> bool:
    """Save cards to YAML file."""
    _ensure_storage_dir(hass)
    yaml_path = _get_yaml_path(hass)
    
    try:
        # Create backup of existing file
        if os.path.exists(yaml_path):
            backup_path = f"{yaml_path}.bak"
            with open(yaml_path, 'r') as src:
                with open(backup_path, 'w') as dst:
                    dst.write(src.read())
        
        # Write new data
        with open(yaml_path, 'w') as f:
            yaml.dump(cards, f, default_flow_style=False, sort_keys=True)
        
        _LOGGER.debug(f"Saved {len(cards)} cards to YAML")
        return True
    except Exception as e:
        _LOGGER.error(f"Error saving YAML file: {e}")
        return False


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Reusable Card Templates integration."""
    
    # Load existing cards from YAML
    cards = await hass.async_add_executor_job(_load_cards, hass)
    
    _LOGGER.info(f"Loaded {len(cards)} card templates from {STORAGE_DIR}/{STORAGE_FILE}")
    
    # Store in hass.data for access by frontend
    hass.data[DOMAIN] = {
        "cards": cards
    }
    
    async def handle_save_card(call: ServiceCall) -> None:
        """Handle save_card service call."""
        card_hash = call.data.get("hash")
        card_config = call.data.get("config")
        
        if not card_hash or not card_config:
            _LOGGER.error("hash and config are required")
            return
        
        _LOGGER.debug(f"Saving card template: {card_hash}")
        
        # Update in-memory data
        hass.data[DOMAIN]["cards"][card_hash] = card_config
        
        # Save to YAML file
        success = await hass.async_add_executor_job(
            _save_cards, hass, hass.data[DOMAIN]["cards"]
        )
        
        if success:
            # Fire event to notify cards
            hass.bus.async_fire(f"{DOMAIN}_updated", {"hash": card_hash})
            _LOGGER.info(f"Saved card template: {card_hash}")
        else:
            _LOGGER.error(f"Failed to save card template: {card_hash}")
    
    async def handle_delete_card(call: ServiceCall) -> None:
        """Handle delete_card service call."""
        card_hash = call.data.get("hash")
        
        if not card_hash:
            _LOGGER.error("hash is required")
            return
        
        _LOGGER.debug(f"Attempting to delete card template: {card_hash}")
        
        if card_hash in hass.data[DOMAIN]["cards"]:
            # Remove from in-memory data
            del hass.data[DOMAIN]["cards"][card_hash]
            
            # Save to YAML file
            success = await hass.async_add_executor_job(
                _save_cards, hass, hass.data[DOMAIN]["cards"]
            )
            
            if success:
                # Fire event to notify cards
                hass.bus.async_fire(f"{DOMAIN}_updated", {"hash": card_hash, "deleted": True})
                _LOGGER.info(f"Deleted card template: {card_hash}")
            else:
                _LOGGER.error(f"Failed to delete card template: {card_hash}")
        else:
            _LOGGER.warning(f"Card template not found: {card_hash}")
    
    # Register services with schemas
    hass.services.async_register(
        DOMAIN, 
        "save_card", 
        handle_save_card,
        schema=SAVE_CARD_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, 
        "delete_card", 
        handle_delete_card,
        schema=DELETE_CARD_SCHEMA
    )
    
    # Create sensor platform
    from homeassistant.helpers import discovery

    hass.async_create_task(
        discovery.async_load_platform(hass, "sensor", DOMAIN, {}, config)
    )
    
    return True