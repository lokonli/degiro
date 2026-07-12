export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { scheduleDailyDegiroSync } = await import("@/lib/degiroSync");
  scheduleDailyDegiroSync();
}
