"""Layer 1: 3 trees visible (squares). Facades and buildings are in `buildings`."""

from kedro.pipeline import Pipeline, node, pipeline

from .download import download_canopy_height
from .nodes import find_trees, rule3_squares


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                download_canopy_height,
                [
                    "params:capital",
                    "grid",
                    "boundaries",
                    "params:method",
                    "params:sources",
                    "params:paths",
                ],
                "canopy_height_source",
                name="download_canopy_height",
            ),
            node(
                find_trees,
                ["canopy_height_source", "grid", "city_mask", "params:method", "params:sources"],
                ["trees", "trees_stats"],
                name="find_trees",
            ),
            node(
                rule3_squares,
                ["grid", "city_mask", "trees", "buildings", "params:method"],
                ["rule3", "rule3_stats"],
                name="rule3_squares",
            ),
        ]
    )
