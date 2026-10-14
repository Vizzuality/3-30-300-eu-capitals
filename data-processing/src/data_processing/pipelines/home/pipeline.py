"""The Home map: europe.pmtiles, from Natural Earth's 1:50m countries."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import download_natural_earth, europe_archive, europe_features

# Also part of the release pipeline (sources.json lists Natural Earth's version).
natural_earth_node = node(
    download_natural_earth,
    ["params:sources", "params:paths"],
    "natural_earth_source",
    name="download_natural_earth",
)


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            natural_earth_node,
            node(
                europe_features,
                ["natural_earth_source", "params:capitals", "params:home", "params:paths"],
                ["europe_tiles", "europe_tiles_stats"],
                name="europe_features",
            ),
            node(
                europe_archive,
                ["europe_tiles", "params:home", "params:paths", "params:tippecanoe_dir"],
                ["europe_pmtiles", "europe_pmtiles_stats"],
                name="europe_archive",
            ),
        ]
    )
