const base = process.argv[2] ?? "http://127.0.0.1:4423";
try {
  const response = await fetch(new URL("/api/report?date=2026-11-15", base));
  if (!response.ok) throw new Error("HTTP " + response.status);
  console.log(JSON.stringify(await response.json(), null, 2));
} catch (error) {
  console.error(error.message + "; start the app first with npm start.");
  process.exitCode = 1;
}
