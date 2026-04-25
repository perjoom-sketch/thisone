const fs = require('fs');
const rankingCode = fs.readFileSync('./js/ranking.js', 'utf-8');
const window = {};
const localStorage = { getItem: () => null, setItem: () => {} };
eval(rankingCode);

const items = [
  {
    id: "1",
    name: "로보락 호환 S8 MaxV Ultra S8 Max Ultra 소모품 사이드브러쉬 1개",
    priceText: "900",
    lprice: 900,
    store: "리필연구소",
    delivery: "배송비 미확인",
    review: "",
    image: "url"
  }
];

const q = "로보락 S8 MaxV Ultra";
const candidates = buildCandidates(items, q, {
  categoryHint: "가전/로봇청소기",
  refinedSearchTerm: "로보락 S8 MaxV Ultra"
});
console.log("Candidates length:", candidates.length);
if (candidates.length > 0) {
  console.log(candidates[0]);
} else {
  // Let's debug why it was or wasn't excluded.
  const c = { ...items[0], priceNum: 900, totalPriceNum: 900 };
  const risk = shouldExcludeFromPriceRank(c, q, 0, { categoryHint: "가전/로봇청소기" });
  console.log("Risk:", risk);
}
