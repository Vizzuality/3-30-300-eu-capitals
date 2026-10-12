"""The project's parameters outside a Kedro run (release checks, helper commands)."""

from __future__ import annotations

import warnings
from pathlib import Path

from kedro.config import OmegaConfigLoader

PROJECT = Path(__file__).resolve().parents[2]


warnings.filterwarnings("ignore", message="register_new_resolver", category=UserWarning)


def parameters(**runtime_params) -> dict:
    loader = OmegaConfigLoader(
        str(PROJECT / "conf"),
        base_env="base",
        default_run_env="local",
        runtime_params=runtime_params or None,
        config_patterns={"parameters": ["parameters*", "parameters*/**"]},
    )
    return loader["parameters"]
