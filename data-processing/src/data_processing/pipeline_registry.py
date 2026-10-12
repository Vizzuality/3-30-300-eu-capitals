"""Project pipelines: one per step of the method (boundaries, grid, residents, the three rules,
buildings and facades, contextual layers, combined layer), plus the export and the release."""

from __future__ import annotations

from kedro.framework.project import find_pipelines
from kedro.pipeline import Pipeline


def register_pipelines() -> dict[str, Pipeline]:
    pipelines = find_pipelines()
    pipelines["__default__"] = sum(pipelines.values())
    return pipelines
