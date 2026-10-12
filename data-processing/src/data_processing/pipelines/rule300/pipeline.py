"""Layer 3: 300 m walk to a green space (squares). Buildings are in `buildings`."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import (
    build_parks,
    build_walk_network,
    rule300_squares,
    walk_to_parks,
)


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                build_parks,
                ["osm_features", "boundaries", "params:method"],
                ["parks", "parks_stats"],
                name="build_parks",
            ),
            node(
                build_walk_network,
                ["osm_features", "params:method"],
                ["walk_network", "walk_network_stats"],
                name="build_walk_network",
            ),
            node(
                walk_to_parks,
                ["walk_network", "parks", "water", "params:method"],
                ["walk", "walk_sources", "walk_stats"],
                name="walk_to_parks",
            ),
            node(
                rule300_squares,
                ["grid", "city_mask", "walk", "walk_sources", "parks", "water_2m", "params:method"],
                ["walk_distance", "rule300", "rule300_stats"],
                name="rule300_squares",
            ),
        ]
    )
