import os

os.environ.setdefault("KEDRO_DISABLE_TELEMETRY", "true")
os.environ.setdefault("NUMBA_CACHE_DIR", os.path.join(os.path.dirname(__file__), ".numba_cache"))
