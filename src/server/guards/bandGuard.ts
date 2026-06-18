import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import { config } from "../../config";
import { JWT } from "../../shared/JWT";

export const banGuard = {
  async beforeHandle({ bearer }) {
    const bearerToken = bearer as string | undefined;
    if (!bearerToken) throw new AuthenticationError("No token provided");
    const jwt = new JWT(config.jwt);
    let userId: string;
    try {
      const decoded = jwt.decode(bearerToken) as { id: string };
      userId = decoded.id;
    } catch {
      throw new AuthenticationError("Invalid token");
    }
    const userBanRepository = new UserBanPostgresRepository();
    const getActiveBan = new UserGetActiveBan(userBanRepository);
    const activeBan = await getActiveBan.execute(userId);
    if (activeBan) {
      throw new ForbiddenError("User is banned");
    }
  }
};
