const intervalMs = Number(process.env.TREASURY_REFILL_INTERVAL_MS ?? 60000);

const runRefill = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[treasury-refill] start ${startedAt}`);
  console.log("TODO: fetch SOL balance, get Jupiter quote, execute swap, update DB");
};

runRefill().catch((error) => {
  console.error("Treasury refill failed", error);
  process.exitCode = 1;
});

setInterval(() => {
  runRefill().catch((error) => {
    console.error("Treasury refill failed", error);
  });
}, intervalMs);
