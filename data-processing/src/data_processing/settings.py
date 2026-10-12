"""Kedro project settings (https://docs.kedro.org/en/stable/kedro_project_setup/settings.html)."""

import warnings

# Kedro 1.7 still calls OmegaConf's deprecated register_new_resolver; nothing to act on here.
warnings.filterwarnings("ignore", message="register_new_resolver", category=UserWarning)

CONFIG_LOADER_ARGS = {
    "base_env": "base",
    "default_run_env": "local",
    "config_patterns": {
        "catalog": ["catalog*", "catalog*/**"],
        "parameters": ["parameters*", "parameters*/**"],
    },
}
