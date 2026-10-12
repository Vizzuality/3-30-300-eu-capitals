"""Layer 2: 30 % canopy within 500 m (squares). Buildings are in `buildings`."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import canopy_cover, rule30_squares


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                canopy_cover,
                ["canopy_height_source", "grid", "water", "params:method", "params:sources"],
                ["canopy_px", "land_px"],
                name="canopy_cover",
            ),
            node(
                rule30_squares,
                ["canopy_px", "land_px", "city_mask", "grid", "params:method"],
                ["canopy_share", "rule30", "rule30_stats"],
                name="rule30_squares",
            ),
        ]
    )
