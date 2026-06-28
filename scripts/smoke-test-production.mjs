const body = JSON.stringify({
  topic: "deployment smoke test",
  duration: 3,
  mood: "Informative",
  generationId: "smoke-test-2",
});

const response = await fetch(
  "https://radio-show-builder.onrender.com/api/generate-show",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }
);

console.log("status", response.status, response.headers.get("content-type"));

if (!response.ok || !response.body) {
  console.log(await response.text());
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let eventCount = 0;

while (eventCount < 15) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  process.stdout.write(chunk);
  if (chunk.includes("data:")) eventCount += 1;
  if (chunk.includes('"type":"error"')) {
    await reader.cancel();
    process.exit(1);
  }
}

await reader.cancel();
console.log("\nSSE smoke test passed: stream started successfully.");
