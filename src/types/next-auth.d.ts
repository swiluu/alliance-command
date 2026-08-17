import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      isSuperadmin: boolean;
      isMember: boolean;
      isR4: boolean;
      playerId: string | null;
      locale: string;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}
