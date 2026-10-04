// Usage : node openrouter.mjs "Votre question"
// La clé est ajoutée automatiquement par le proxy de l'environnement (identifiant API
// pour openrouter.ai). En local, définissez OPENROUTER_API_KEY.
// Dans cet environnement cloud, lancez : NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node openrouter.mjs
const apiKey = process.env.OPENROUTER_API_KEY;
const question = process.argv[2] ?? "What is the meaning of life?";

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
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
