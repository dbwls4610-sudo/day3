const { spots } = require("../제주대_JSON꺼내기_실습데이_8시간/jeju_spots.json");

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

// Claude에 넘기는 도구 설명
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
];

const tools = { find_spots };

module.exports = { find_spots, tools, toolDefinitions };
