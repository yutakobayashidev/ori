import { createServer } from "node:http";

const number = (id, label, unit) => ({
  id,
  label,
  type: "number",
  required: true,
  unit,
  metric: {
    id: id === "weight" ? "body_weight" : `blood_pressure.${id}`,
    label: id === "weight" ? "Weight" : id === "systolic" ? "Systolic" : "Diastolic",
    group: id === "weight" ? "body_weight" : "blood_pressure",
  },
  options: [],
  min: null,
  max: null,
});
const draft = {
  name: "Evening care",
  description: "Wash, weigh and measure blood pressure.",
  aliases: ["夜のお手入れ"],
  schedule: {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "bedtime",
    time: null,
    timeZone: "Asia/Tokyo",
  },
  steps: [
    { id: "bath", label: "Bath", repeatable: false, layout: "stack", fields: [] },
    {
      id: "medication",
      label: "Medication",
      repeatable: false,
      layout: "stack",
      fields: [
        {
          id: "medicines",
          label: "Medicines taken",
          type: "multiChoice",
          required: true,
          unit: null,
          metric: null,
          min: null,
          max: null,
          options: [
            { value: "med_a", label: "Medicine A" },
            { value: "med_b", label: "Medicine B" },
          ],
        },
      ],
    },
    {
      id: "weight",
      label: "Weight",
      repeatable: false,
      layout: "stack",
      fields: [number("weight", "Weight", "kg")],
    },
    {
      id: "pressure",
      label: "Blood pressure",
      repeatable: true,
      layout: "inline",
      fields: [number("systolic", "Systolic", "mmHg"), number("diastolic", "Diastolic", "mmHg")],
    },
    {
      id: "night_pressure",
      label: "Night blood pressure",
      repeatable: false,
      layout: "inline",
      fields: [
        number("systolic", "Night systolic", "mmHg"),
        number("diastolic", "Night diastolic", "mmHg"),
      ],
    },
  ],
};
const runs = new Map();
const server = createServer(async (request, response) => {
  if (request.headers.authorization !== "Bearer isolated-e2e-routine-runtime") {
    response.writeHead(401).end();
    return;
  }
  if (request.method === "POST" && request.url === "/runs") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const run = JSON.parse(body);
    if (!run.config?.readOnly || !run.config?.outputSchema || !run.config?.developerInstructions) {
      response.writeHead(400).end("Structured read-only request required");
      return;
    }
    const { conversation, currentDraft } = JSON.parse(run.prompt);
    const users = conversation.filter((message) => message.role === "user");
    const edited = currentDraft && users.at(-1).text.includes("Rename");
    const reply = edited
      ? {
          message: "Name updated.",
          questions: [],
          missingFields: [],
          draft: { ...currentDraft, name: "Night care" },
        }
      : users.length === 1
        ? {
            message: "Let's choose a time.",
            questions: ["When would you like to do this?"],
            missingFields: ["schedule"],
            draft: null,
          }
        : { message: "Your routine is ready to review.", questions: [], missingFields: [], draft };
    runs.set(run.id, { status: "review", finalOutput: JSON.stringify(reply) });
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ id: run.id }));
    return;
  }
  const match = request.url?.match(/^\/runs\/([^/]+)\/events$/);
  if (match && runs.has(match[1])) {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(`data: ${JSON.stringify(runs.get(match[1]))}\n\n`);
    return;
  }
  if (request.url?.endsWith("/stop")) {
    response.writeHead(200).end("{}");
    return;
  }
  response.writeHead(404).end();
});
server.listen(6912, "127.0.0.1");
