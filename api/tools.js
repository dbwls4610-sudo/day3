const { spots } = require("../data/jeju_spots.json");

const MAX_RESULTS = 8;
const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];

const find_spots = ({ area, indoor }) => {
    if (!AREAS.includes(area)) {
        return { error: `area는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
    }
    const found = spots.filter(s =>
        s.area === area &&
        (indoor === undefined || indoor === null || s.indoor === indoor)
    );
    return {
        total: found.length,
        spots: found.slice(0, MAX_RESULTS).map(s => ({
            name: s.name,
            area: s.area,
            indoor: s.indoor,
            description: s.desc,
        })),
    };
};

// WMO 날씨 코드 → 한글
const weatherText = (c) =>
    c === 0 ? "맑음" :
    c <= 3 ? "구름" :
    c <= 48 ? "안개" :
    c <= 57 ? "이슬비" :
    c <= 67 ? "비" :
    c <= 77 ? "눈" :
    c <= 82 ? "소나기" :
    c <= 86 ? "눈보라" : "뇌우";

// Open-Meteo(키 불필요)로 목록에 있는 장소의 현재 날씨를 조회한다.
const get_weather = async ({ name }) => {
    const spot = spots.find(s => s.name === name);
    if (!spot) return { error: `'${name}'은(는) 목록에 없는 장소입니다.` };
    const url = "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${spot.lat}&longitude=${spot.lon}` +
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m" +
        "&daily=precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1";
    const res = await fetch(url);
    if (!res.ok) return { error: `날씨 조회 실패 (${res.status})` };
    const { current, daily } = await res.json();
    return {
        name: spot.name,
        weather: weatherText(current.weather_code),
        temperature_c: current.temperature_2m,
        precipitation_mm: current.precipitation,
        wind_kmh: current.wind_speed_10m,
        rain_probability_max_percent: daily.precipitation_probability_max[0],
    };
};

// 모델에 넘기는 도구 설명 (chat.js에서 Gemini의 functionDeclarations 형식으로 변환)
const toolDefinitions = [
    {
        name: "find_spots",
        description:
            "제주특별자치도 관광지 목록(jeju_spots.json, 19곳)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 " +
            "이름 · 지역 · 실내 여부 · 설명을 돌려준다. 이 목록 밖의 장소는 없다. " +
            "목록에 없는 장소나 제주 밖의 장소는 추천하거나 지어내지 말고, 결과가 없으면 없다고 답한다. " +
            "운영시간 · 요금 등은 담겨 있지 않다.",
        input_schema: {
            type: "object",
            properties: {
                area: {
                    type: "string",
                    enum: AREAS,
                    description: "찾을 지역",
                },
                indoor: {
                    type: "boolean",
                    description: "true면 실내만, false면 야외만. 생략하면 모두.",
                },
            },
            required: ["area"],
        },
    },
    {
        name: "get_weather",
        description:
            "find_spots로 찾은 장소 한 곳의 현재 날씨(날씨 · 기온 · 강수량 · 풍속)와 오늘 최대 강수확률을 조회한다. " +
            "name에는 find_spots 결과에 나온 장소 이름을 그대로 넣는다. 목록 밖의 장소는 조회할 수 없다.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "find_spots 결과의 장소 이름" },
            },
            required: ["name"],
        },
    },
];

const tools = { find_spots, get_weather };

module.exports = { find_spots, get_weather, tools, toolDefinitions, spots };
