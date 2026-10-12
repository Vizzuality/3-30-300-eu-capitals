"""Combined layer: rules met per square, and the shares of residents."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import combine


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                combine,
                [
                    "grid",
                    "city_mask",
                    "water_mask",
                    "rule3",
                    "rule30",
                    "rule300",
                    "population",
                    "params:method",
                    "params:tiles",
                ],
                ["met", "grid_values", "city_summary"],
                name="combine",
            ),
        ]
    )
