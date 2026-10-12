"""Common steps 1–2: the city, its 1 km buffer, the sea, and the OpenStreetMap layers."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import (
    build_boundaries,
    build_water,
    download_land_polygons,
    download_osm_extract,
    read_boundary,
    read_osm,
)


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                download_osm_extract,
                ["params:capital", "params:capitals", "params:sources", "params:paths"],
                "osm_extract",
                name="download_osm_extract",
            ),
            node(
                read_boundary,
                ["osm_extract", "params:capital", "params:capitals", "params:paths"],
                "boundary_source",
                name="read_boundary",
            ),
            node(
                download_land_polygons,
                ["params:sources", "params:paths"],
                "land_polygons_source",
                name="download_land_polygons",
            ),
            node(
                build_boundaries,
                ["boundary_source", "land_polygons_source", "params:method"],
                ["boundaries", "boundary_stats"],
                name="build_boundaries",
            ),
            node(
                read_osm,
                ["osm_extract", "boundaries", "params:method", "params:paths"],
                "osm_features",
                name="read_osm",
            ),
            node(
                build_water,
                ["osm_features", "boundaries", "params:method"],
                "water",
                name="build_water",
            ),
        ]
    )
