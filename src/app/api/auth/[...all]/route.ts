import { toNextJsHandler } from "better-auth/next-js";

async function handlers() {
  const { auth } = await import("@/shared/lib/auth");
  return toNextJsHandler(auth);
}

export async function GET(request: Request) {
  return (await handlers()).GET(request);
}

export async function POST(request: Request) {
  return (await handlers()).POST(request);
}
