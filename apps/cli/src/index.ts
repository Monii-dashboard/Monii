const command = process.argv.slice(2).find((argument) => argument !== "--");

if (command === "sync") {
  console.log(
    JSON.stringify({
      level: "info",
      event: "sync.started",
      message: "Daily synchronization started",
      dummy: true,
    }),
  );
}
