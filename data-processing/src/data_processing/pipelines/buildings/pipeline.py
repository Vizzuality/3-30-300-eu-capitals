"""Buildings and facades: facades, trees seen per facade, the three rules per building."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import building_rules, facade_trees, make_facades


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                make_facades,
                ["buildings", "params:method"],
                ["facade_walls", "facade_samples", "facades_stats"],
                name="make_facades",
            ),
            node(
                facade_trees,
                ["facade_walls", "facade_samples", "trees", "buildings", "grid", "params:method"],
                ["facades", "facade_seen", "facade_trees_stats"],
                name="facade_trees",
            ),
            node(
                building_rules,
                [
                    "buildings",
                    "building_residents",
                    "facades",
                    "canopy_px",
                    "land_px",
                    "grid",
                    "walk",
                    "walk_sources",
                    "parks",
                    "water_2m",
                    "params:method",
                ],
                ["building_results", "building_routes", "buildings_stats"],
                name="building_rules",
            ),
        ]
    )
