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

CLEANUP_ORPHANED_SCHEMA = vol.Schema({
    vol.Optional("view"): cv.string,
    vol.Optional("dry_run", default=True): cv.boolean,
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


def _get_lovelace_config(hass: HomeAssistant) -> dict:
    """Get the current Lovelace configuration."""
    try:
        # Try to get lovelace config from storage
        lovelace_storage_path = hass.config.path(".storage/lovelace")
        if os.path.exists(lovelace_storage_path):
            with open(lovelace_storage_path, 'r') as f:
                data = yaml.safe_load(f)
                return data.get('data', {})
        
        # Fallback to UI lovelace mode
        # Note: This only works if lovelace is in storage mode
        _LOGGER.warning("Could not access Lovelace config - cleanup may be incomplete")
        return {}
    except Exception as e:
        _LOGGER.error(f"Error loading Lovelace config: {e}")
        return {}


def _find_card_hashes_in_config(config: dict) -> set:
    """Recursively find all reusable-card-parent hashes in a Lovelace config."""
    hashes = set()
    
    if not isinstance(config, dict):
        return hashes
    
    # Check if this is a reusable-card-parent
    if config.get('type') == 'custom:reusable-card-parent' and config.get('hash'):
        hashes.add(config['hash'])
    
    # Recursively search in common card container properties
    for key in ['cards', 'badges', 'elements', 'entities', 'views', 'sections']:
        if key in config and isinstance(config[key], list):
            for item in config[key]:
                hashes.update(_find_card_hashes_in_config(item))
    
    return hashes


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
    
    async def handle_cleanup_orphaned(call: ServiceCall) -> None:
        """Handle cleanup_orphaned service call.
        
        Finds template hashes that don't have corresponding parent cards in the
        Lovelace configuration and optionally deletes them.
        """
        specific_view = call.data.get("view")
        dry_run = call.data.get("dry_run", True)
        
        _LOGGER.info(f"Running cleanup_orphaned (dry_run={dry_run}, view={specific_view or 'all'})")
        
        # Get current stored templates
        stored_hashes = set(hass.data[DOMAIN]["cards"].keys())
        
        if not stored_hashes:
            _LOGGER.info("No templates found in storage")
            return
        
        # Get Lovelace config and find all parent card hashes
        lovelace_config = await hass.async_add_executor_job(_get_lovelace_config, hass)
        active_hashes = _find_card_hashes_in_config(lovelace_config)
        
        # Filter by view if specified
        if specific_view:
            view_suffix = f".{specific_view}"
            stored_hashes = {h for h in stored_hashes if h.endswith(view_suffix)}
            active_hashes = {h for h in active_hashes if h.endswith(view_suffix)}
            _LOGGER.debug(f"Filtered to view '{specific_view}': {len(stored_hashes)} stored, {len(active_hashes)} active")
        
        # Find orphaned hashes
        orphaned_hashes = stored_hashes - active_hashes
        
        if not orphaned_hashes:
            _LOGGER.info("No orphaned templates found")
            return
        
        _LOGGER.info(f"Found {len(orphaned_hashes)} orphaned template(s): {sorted(orphaned_hashes)}")
        
        if dry_run:
            _LOGGER.info("DRY RUN - Would delete the following templates:")
            for hash_val in sorted(orphaned_hashes):
                _LOGGER.info(f"  - {hash_val}")
        else:
            # Actually delete orphaned templates
            deleted_count = 0
            for hash_val in orphaned_hashes:
                if hash_val in hass.data[DOMAIN]["cards"]:
                    del hass.data[DOMAIN]["cards"][hash_val]
                    deleted_count += 1
            
            # Save to YAML file
            if deleted_count > 0:
                success = await hass.async_add_executor_job(
                    _save_cards, hass, hass.data[DOMAIN]["cards"]
                )
                
                if success:
                    # Fire event to notify cards
                    hass.bus.async_fire(f"{DOMAIN}_updated", {"cleanup": True})
                    _LOGGER.info(f"Deleted {deleted_count} orphaned template(s)")
                else:
                    _LOGGER.error("Failed to save after cleanup")
    
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
    hass.services.async_register(
        DOMAIN,
        "cleanup_orphaned",
        handle_cleanup_orphaned,
        schema=CLEANUP_ORPHANED_SCHEMA
    )
    
    # Create sensor platform
    from homeassistant.helpers import discovery

    hass.async_create_task(
        discovery.async_load_platform(hass, "sensor", DOMAIN, {}, config)
    )
    
    return True