/**
 * Where the data API reads the files of the release in use: a local folder
 * for now, the storage bucket once the site is deployed. Paths are relative
 * to the release (`capitals/stockholm/summary.json`).
 */
export interface ReleaseFiles {
  /** The file's text, or null when the release has no such file */
  readText(path: string): Promise<string | null>
  /**
   * Up to `length` bytes of the file from `offset` (fewer at its end), or
   * null when the release has no such file: how the tile archives are read
   */
  readBytes(
    path: string,
    offset: number,
    length: number
  ): Promise<ArrayBuffer | null>
}
