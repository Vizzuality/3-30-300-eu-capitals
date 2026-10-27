/*
 * Buildings of the stand-in's corner of Stockholm (central Södermalm), with
 * the area to find them in: a selected building is read from the tiles of
 * the area in view of its address.
 */

/** About 600 m across, centred on building 4176 (1 rule met) */
export const streetArea = "18.0698%2C59.3092%2C18.0805%2C59.3144"

/** About 300 m across, centred on building 31947 */
export const southernArea = "18.0813%2C59.3101%2C18.0866%2C59.3127"

/**
 * Building 31947, which meets the 3 trees rule only (its facade 102293 sees
 * 6 trees), as its address opens it
 */
export const southern = `/en/capitals/stockholm?building=31947&at=${southernArea}`
