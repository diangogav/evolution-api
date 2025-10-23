import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { UserAuth } from "../../../../../src/modules/auth/application/UserAuth";
import { User } from "../../../../../src/modules/user/domain/User";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserAuthRequestMother } from "../../users/mothers/UserAuthRequestMother";
import { UserMother } from "../../users/mothers/UserMother";
import type { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";

describe("UserAuth", () => {
  let userAuth: UserAuth;
  let repository: UserRepository;
  let hash: Hash;
  let jwt: JWT;
  let user: User;
  let request: { email: string; password: string };

  beforeEach(async () => {
    hash = new Hash();
    jwt = new JWT({ issuer: "issuer", secret: "secret" });

    repository = {
      create: async () => {},
      findByEmailOrUsername: async () => null,
      findByEmail: async () => null,
      findById: async () => null,
      update: async () => {},
    };

    userAuth = new UserAuth(repository, hash, jwt);
    request = UserAuthRequestMother.create();

    const hashedPassword = await hash.hash(request.password);
    user = UserMother.create({ password: hashedPassword, email: request.email });
  });

  it("Should login success if data is correct", async () => {
    spyOn(repository, "findByEmail").mockResolvedValue(user);

    const response = await userAuth.login(request);

    expect(repository.findByEmail).toHaveBeenCalledTimes(1);
    expect(repository.findByEmail).toHaveBeenCalledWith(request.email);

    expect(response).toHaveProperty("token");
    expect(response).toHaveProperty("username", user.username);
    expect(response).toHaveProperty("id", user.id);
  });

  it("Should throw an AuthenticationError if user does not exist", async () => {
    spyOn(repository, "findByEmail").mockResolvedValue(null);

    await expect(userAuth.login(request)).rejects.toThrowError(
      new AuthenticationError("Wrong email or password"),
    );
  });

  it("Should throw an AuthenticationError if password is invalid", async () => {
    spyOn(repository, "findByEmail").mockResolvedValue(user);
    request.password = "InvalidPassword";

    await expect(userAuth.login(request)).rejects.toThrowError(
      new AuthenticationError("Wrong email or password"),
    );
  });
});
