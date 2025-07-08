import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { config } from "../../config";
import { JWT } from "../../shared/JWT";

export const banGuard = {
  async beforeHandle({ set, bearer }) {
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
      set.status = 403;
      throw new AuthenticationError("User is banned");
    }
  }
};
