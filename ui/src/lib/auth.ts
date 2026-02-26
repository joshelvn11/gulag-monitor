import { createAuthClient } from "better-auth/react";

const baseURL = typeof window !== "undefined" ? window.location.origin : undefined;

export const authClient = createAuthClient({
  ...(baseURL ? { baseURL } : {}),
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "same-origin",
  },
});
