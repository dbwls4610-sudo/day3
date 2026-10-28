const { tools, toolDefinitions, spots } = require("./tools");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_STEPS = 8;

const SYSTEM = `너는 제주 여행 추천 도우미다.
- 장소는 반드시 find_spots로 찾고, 추천하기 전에 후보 장소의 날씨를 get_weather로 확인한다.
- 비가 오거나 강수확률이 높거나 바람이 센 곳은 실내를, 맑으면 야외를 우선 추천한다.
- 도구 결과에 없는 장소는 절대 추천하지 않는다. 지역이 불분명하면 동쪽 · 서쪽 · 서귀포 · 제주시 중 가장 가까운 곳으로 해석하고, 그 사실을 알려준다.
- 답변은 한국어로 짧게, 추천 장소마다 날씨를 근거로 이유를 한 줄씩 쓴다.`;

// tools.js의 도구 설명(name · description · input_schema)을 Gemini의 functionDeclarations 형식으로 바꾼다.
const functionDeclarations = toolDefinitions.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
}));

async function callGemini(contents) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            tools: [{ functionDeclarations }],
            contents,
        }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    return res.json();
}

// 에이전트 루프: Gemini가 함수 호출을 요청하면 실행해서 결과를 돌려주고, 최종 답이 나올 때까지 반복한다.
module.exports = async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." });

    const { message, history = [] } = req.body || {};
    if (!message) return res.status(400).json({ error: "message가 필요합니다." });

    // 화면의 대화 기록(user / assistant)을 Gemini 형식(user / model)으로 바꾼다.
    const contents = [
        ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
        { role: "user", parts: [{ text: message }] },
    ];
    const steps = [];
    const shown = new Map();

    try {
        for (let i = 0; i < MAX_STEPS; i++) {
            const reply = await callGemini(contents);
            const content = reply.candidates?.[0]?.content;
            if (!content) throw new Error("Gemini 응답이 비어 있습니다: " + JSON.stringify(reply.promptFeedback || reply));
            contents.push(content); // 함수 호출 파트를 그대로 되돌려 보내야 한다

            const calls = (content.parts || []).filter(p => p.functionCall).map(p => p.functionCall);
            if (!calls.length) {
                const answer = content.parts.map(p => p.text || "").join("");
                return res.status(200).json({ answer, steps, spots: [...shown.values()] });
            }

            const responses = [];
            for (const call of calls) {
                const result = tools[call.name]
                    ? await tools[call.name](call.args || {})
                    : { error: `알 수 없는 도구: ${call.name}` };
                steps.push({ tool: call.name, input: call.args });
                if (call.name === "find_spots") {
                    for (const s of result.spots || []) shown.set(s.name, spots.find(x => x.name === s.name));
                }
                responses.push({ functionResponse: { name: call.name, response: { result } } });
            }
            contents.push({ role: "user", parts: responses });
        }
        res.status(200).json({ answer: "도구 호출이 너무 길어져 중단했습니다. 질문을 더 구체적으로 해주세요.", steps, spots: [...shown.values()] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
