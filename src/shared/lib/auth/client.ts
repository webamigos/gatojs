import { createAuthClient } from "better-auth/react";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { authClientPlugins } from "@/modules.client.generated";

export const authClient = createAuthClient({
  plugins: [adminClient(), organizationClient(), ...authClientPlugins],
});
