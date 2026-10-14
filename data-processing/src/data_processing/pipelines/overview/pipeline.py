"""The capital page's overview: the water, roads and district names of its context rectangle
(context.pmtiles)."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import context_archive, context_water
from .orientation import context_orientation


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                context_water,
                [
                    "params:capital",
                    "summary_json",
                    "boundaries",
                    "land_polygons_source",
                    "params:capitals",
                    "params:sources",
                    "params:overview",
                    "params:paths",
                ],
                ["context_tiles", "context_tiles_stats"],
                name="context_water",
            ),
            node(
                context_orientation,
                [
                    "params:capital",
                    "summary_json",
                    "boundaries",
                    "boundary_source",
                    "land_polygons_source",
                    "population_source",
                    "fonts",
                    "params:capitals",
                    "params:sources",
                    "params:overview",
                    "params:paths",
                ],
                ["context_orientation_tiles", "context_orientation_stats"],
                name="context_orientation",
            ),
            node(
                context_archive,
                [
                    "params:capital",
                    "context_tiles",
                    "context_orientation_tiles",
                    "summary_json",
                    "params:overview",
                    "params:paths",
                    "params:tippecanoe_dir",
                ],
                ["context_pmtiles", "context_pmtiles_stats"],
                name="context_archive",
            ),
        ]
    )
