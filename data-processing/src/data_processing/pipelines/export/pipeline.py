"""Export: the capital's folder of the release (grid, city and evidence archives, summary)."""

from kedro.pipeline import Pipeline, node, pipeline

from .nodes import city_archive, download_names, evidence_archive, grid_archive, summary


def create_pipeline(**kwargs) -> Pipeline:
    return pipeline(
        [
            node(
                grid_archive,
                ["params:capital", "grid_values", "boundaries", "params:tiles", "params:paths"],
                ["grid_pmtiles", "grid_pmtiles_stats"],
                name="grid_archive",
            ),
            node(
                city_archive,
                [
                    "params:capital",
                    "tiles_water",
                    "tiles_parks",
                    "tiles_streets",
                    "tiles_canopy",
                    "tiles_trees",
                    "tiles_buildings",
                    "params:tiles",
                    "params:paths",
                    "params:tippecanoe_dir",
                ],
                ["city_pmtiles", "city_pmtiles_stats"],
                name="city_archive",
            ),
            node(
                evidence_archive,
                [
                    "params:capital",
                    "buildings",
                    "building_results",
                    "building_points",
                    "facades",
                    "facade_seen",
                    "trees",
                    "building_routes",
                    "parks",
                    "boundaries",
                    "params:method",
                    "params:tiles",
                    "params:paths",
                ],
                ["evidence_pmtiles", "evidence_pmtiles_stats"],
                name="evidence_archive",
            ),
            node(
                download_names,
                [
                    "params:capital",
                    "params:capitals",
                    "params:locales",
                    "params:sources",
                    "params:paths",
                ],
                "names",
                name="download_names",
            ),
            node(
                summary,
                [
                    "params:capital",
                    "params:release",
                    "params:capitals",
                    "city_summary",
                    "names",
                    "boundaries",
                    "boundary_stats",
                    "tiles_streets_stats",
                    "canopy_height_source",
                    "buildings_source",
                    "population_source",
                    "osm_extract",
                    "params:sources",
                    "params:tiles",
                    "params:paths",
                ],
                ["summary_json", "release_record"],
                name="summary",
            ),
        ]
    )
