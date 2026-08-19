import { getSession } from "../session.js";

export async function stopApp(): Promise<{ stopped: boolean }> {
  const session = getSession();
  await session.teardown();
  return { stopped: true };
}
