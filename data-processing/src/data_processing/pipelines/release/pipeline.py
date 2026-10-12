"""Cross-capital files of the release: ranking.json and capitals.json (europe.pmtiles, the Home
map, is not written yet)."""

from kedro.pipeline import Pipeline, node, pipeline

from data_processing.pipelines.export.nodes import release_index


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                release_index,
                [
                    "params:release",
                    "params:capitals",
                    "params:sources",
                    "params:paths",
                    "release_record",
                ],
                ["ranking_json", "capitals_json", "sources_json"],
                name="release_index",
                tags=["release"],
            ),
        ]
    )
