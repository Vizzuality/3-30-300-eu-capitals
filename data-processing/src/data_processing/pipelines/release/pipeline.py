"""Cross-capital files of the release: ranking.json, capitals.json (with the capitals' places on
the Home map) and sources.json."""

from kedro.pipeline import Pipeline, node, pipeline

from data_processing.pipelines.export.nodes import release_index
from data_processing.pipelines.home.pipeline import natural_earth_node


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            natural_earth_node,
            node(
                release_index,
                [
                    "params:release",
                    "params:capitals",
                    "params:sources",
                    "params:home",
                    "params:paths",
                    "natural_earth_source",
                    "release_record",
                ],
                ["ranking_json", "capitals_json", "sources_json"],
                name="release_index",
                tags=["release"],
            ),
        ]
    )
