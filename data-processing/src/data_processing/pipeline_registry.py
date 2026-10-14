"""Project pipelines: one per step of the method (boundaries, grid, residents, the three rules,
buildings and facades, contextual layers, combined layer), plus the export and the release.

The default pipeline (one capital, then the cross-capital files) leaves out ``home``, the Home map
(``europe.pmtiles``), which does not depend on any capital: `just run-all` and `just home` run
it."""

from __future__ import annotations

from kedro.framework.project import find_pipelines
from kedro.pipeline import Pipeline


def register_pipelines() -> dict[str, Pipeline]:
    pipelines = find_pipelines()
    pipelines["__default__"] = sum(p for name, p in pipelines.items() if name != "home")
    return pipelines
