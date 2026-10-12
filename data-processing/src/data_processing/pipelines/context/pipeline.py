"""Contextual layers: water, shore, parks, streets and their names, canopy, trees, buildings."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import (
    building_features,
    canopy_features,
    download_fonts,
    park_features,
    street_features,
    tree_features,
    water_features,
)

COMMON = ["params:method", "params:tiles", "params:paths"]


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                water_features,
                ["water", "boundaries", *COMMON],
                ["tiles_water", "tiles_water_stats"],
                name="water_features",
            ),
            node(
                park_features, ["parks", "boundaries", *COMMON], "tiles_parks", name="park_features"
            ),
            node(
                download_fonts, ["params:sources", "params:paths"], "fonts", name="download_fonts"
            ),
            node(
                street_features,
                ["osm_features", "parks", "boundaries", "fonts", *COMMON],
                ["tiles_streets", "tiles_streets_stats"],
                name="street_features",
            ),
            node(
                canopy_features,
                [
                    "canopy_height_source",
                    "boundaries",
                    "params:method",
                    "params:sources",
                    "params:tiles",
                    "params:paths",
                ],
                ["tiles_canopy", "tiles_canopy_stats"],
                name="canopy_features",
            ),
            node(
                tree_features, ["trees", "boundaries", *COMMON], "tiles_trees", name="tree_features"
            ),
            node(
                building_features,
                ["buildings", "building_results", "facades", *COMMON],
                ["tiles_buildings", "building_points"],
                name="building_features",
            ),
        ]
    )
