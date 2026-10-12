"""Common step 4: residents placed in buildings."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import download_buildings, download_population, place_population, prepare_buildings


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                download_buildings,
                ["params:capital", "boundaries", "params:method", "params:sources", "params:paths"],
                "buildings_source",
                name="download_buildings",
            ),
            node(
                prepare_buildings,
                ["buildings_source", "boundaries", "params:method"],
                "buildings",
                name="prepare_buildings",
            ),
            node(
                download_population,
                ["grid", "params:sources", "params:paths"],
                "population_source",
                name="download_population",
            ),
            node(
                place_population,
                ["grid", "city_mask", "buildings", "population_source", "params:sources"],
                ["population", "building_residents", "residents_stats"],
                name="place_population",
            ),
        ]
    )
