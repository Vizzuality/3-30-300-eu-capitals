"""Common steps 3 and 5: the shared 10 m grid and the squares of the city."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import city_squares, make_grid, water_squares


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(make_grid, ["boundaries", "params:method"], "grid", name="make_grid"),
            node(
                city_squares,
                ["grid", "boundaries"],
                ["city_mask", "grid_stats"],
                name="city_squares",
            ),
            node(
                water_squares,
                ["grid", "water", "params:method"],
                ["water_mask", "water_2m"],
                name="water_squares",
            ),
        ]
    )
