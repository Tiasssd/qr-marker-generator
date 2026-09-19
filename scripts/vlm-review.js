// VLM-ревью скриншота дизайна (используется z-ai-web-dev-sdk, как в прошлых итерациях)
const ZAI = require('z-ai-web-dev-sdk').default;
const fs = require('fs');

async function main() {
  const file = process.argv[2];
  const prompt = process.argv[3] || 'Опиши интерфейс на скриншоте.';
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(file).toString('base64');
  const res = await zai.chat.completions.createVision({
    model: 'glm-5v-turbo',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  console.log(res.choices[0].message.content);
}

main().catch((e) => { console.error('VLM error:', e.message); process.exit(1); });
