const body = JSON.stringify({
  topic: "auth gate fix verification",
  duration: 3,
  mood: "Informative",
  generationId: "auth-fix-verify",
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
const { done, value } = await reader.read();
const chunk = decoder.decode(value);
process.stdout.write(chunk);
await reader.cancel();

if (chunk.includes('"type":"error"') && chunk.includes("GEMINI")) {
  process.exit(1);
}

console.log("\nGeneration SSE started without auth.");
