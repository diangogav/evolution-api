import { config } from "../../config";
import { JWT } from "../../shared/JWT";

// The one JWT signer and verifier the routers share.
export const apiJwt = new JWT(config.jwt);
