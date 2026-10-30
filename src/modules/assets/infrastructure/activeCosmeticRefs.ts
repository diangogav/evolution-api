import { ActiveCosmeticRefs } from "../domain/ActiveCosmeticRefs";

/**
 * The process-wide active set. Every signer and the index refresher share it, so one
 * reload makes every router hand out public URLs for the same cosmetics.
 */
export const activeCosmeticRefs = new ActiveCosmeticRefs();
