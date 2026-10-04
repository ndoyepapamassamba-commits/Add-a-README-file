// Usage : OPENROUTER_API_KEY=... node openrouter.mjs "Votre question"
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Erreur : définissez la variable d'environnement OPENROUTER_API_KEY.");
  process.exit(1);
}

const question = process.argv[2] ?? "What is the meaning of life?";

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    messages: [{ role: "user", content: question }],
  }),
});

if (!res.ok) {
  console.error(`Erreur HTTP ${res.status} : ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
console.log(data.choices[0].message.content);
