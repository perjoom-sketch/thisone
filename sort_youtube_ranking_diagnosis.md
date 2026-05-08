# 정렬 / YouTube / 인기순 로직 진단 보고서

## 1. `js/image_text_policy_patch.js`

- 파일 존재: **Y**
- `changeSort` 현재 구현: `sortOrMode`를 `total/value/popular/latest`로 정규화한 뒤, API 정렬값으로 매핑하고, 검색 API를 다시 호출한 다음 `rankItemsForMode()`로 클라이언트 측 재정렬 후 렌더링합니다.
- 정렬 탭 4개 현재 동작:
  - `종합 1위` → `window.changeSort('total', this)` → API sort: `sim`
  - `가성비` → `window.changeSort('value', this)` → API sort: `asc`
  - `인기순` → `window.changeSort('popular', this)` → API sort: `sim`
  - `최신순` → `window.changeSort('latest', this)` → API sort: `date`
- 정렬 모달 UI: **없음**. 이 파일은 `.sort-options` 내부 버튼을 직접 치환/삽입하며, 정렬용 modal/dialog 생성 코드는 확인되지 않았습니다.

### 핵심 코드 발췌

```js
function mapSortModeToApi(mode){
  if(mode==='value') return 'asc';
  if(mode==='latest') return 'date';
  return 'sim';
}
global.changeSort=async function(sortOrMode, sourceBtn){
  const mode=normalizeSortMode(sortOrMode);
  const apiSort=mapSortModeToApi(mode);
  setSortActive(mode, sourceBtn);
```

```js
const btn=(key,label)=>`<button class="sort-btn ${activeKey===key?'active':''}" data-sort-mode="${key}" onclick="window.changeSort('${key}', this)">${label}</button>`;
return [btn('total','종합 1위'),btn('value','가성비'),btn('popular','인기순'),btn('latest','최신순')].join('');
```

---

## 2. `api/youtube.js` 또는 유튜브 관련 파일

- `api/youtube.js` 파일 존재: **N**
- 유튜브 관련 파일 존재: **Y** — `lib/youtubeReputation.js`
- 실제 YouTube API 호출 코드: **있음**. `lib/youtubeReputation.js`에서 YouTube Search API와 Videos API URL을 정의하고, `fetch()`로 호출합니다.
- 검색 API 연결 위치: `api/search.js`가 `enrichYoutubeReputation`을 import하고, 검색 결과 1페이지에서 `YOUTUBE_API_KEY`와 timeout을 넘겨 평판 보강을 실행합니다.
- 인기순에 연결된 부분: 직접적인 `api/youtube.js` 인기순 엔드포인트는 없고, YouTube 평판 보강 결과가 `youtubeReputation`, `youtubeScore`로 붙은 뒤 `js/ranking.js`의 인기순 정렬에서 `popularScore` 및 `youtubeReputation.matchedVideoCount`가 보조 기준으로 사용됩니다.

### 핵심 코드 발췌

```js
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const DEFAULT_TIMEOUT_MS = 3500;
```

```js
const searchData = await fetchJsonWithTimeout(`${YOUTUBE_SEARCH_URL}?${searchParams.toString()}`, timeoutMs);
const ids = extractVideoIds(searchData);
if (!ids.length) return [];
const videosData = await fetchJsonWithTimeout(`${YOUTUBE_VIDEOS_URL}?${videosParams.toString()}`, timeoutMs);
```

```js
const youtubeReputation = await enrichYoutubeReputation({
  query: improvedQ,
  items: restoredItems,
  apiKey: process.env.YOUTUBE_API_KEY,
  enabled: isYoutubeReputationEnabled() && start === 1,
```

---

## 3. `js/ranking.js`

- 파일 존재: **Y**
- 인기순 관련 로직: **있음**
- `youtubeScore`, `youtubeReputation`, `matchedVideoCount`, `popularScore` 관련 로직이 있습니다. YouTube 평판 bonus는 점수에 반영되고, 인기순 정렬에서는 `popularScore` 우선, 동점 시 `youtubeReputation.matchedVideoCount`를 보조 기준으로 사용합니다.
- 후보 생성 시 `youtubeReputation`, `youtubeScore`, `youtubeReasons`도 유지됩니다.
- `popularScore`는 현재 `finalScore`와 동일하게 설정됩니다.

### 핵심 코드 발췌

```js
if (sortMode === 'popular') {
  return list.sort((a, b) => {
    const apop = Number(a.popularScore ?? a.finalScore ?? 0);
    const bpop = Number(b.popularScore ?? b.finalScore ?? 0);
    if (bpop !== apop) return bpop - apop;
    const ay = Number(a.youtubeReputation?.matchedVideoCount || 0);
    const by = Number(b.youtubeReputation?.matchedVideoCount || 0);
    if (by !== ay) return by - ay;
```

```js
youtubeReputation: item.youtubeReputation || null,
youtubeScore: Number(item.youtubeScore || item.youtubeReputation?.bonus || 0),
youtubeReasons: String(item.youtubeReasons || (Array.isArray(item.youtubeReputation?.reasons) ? item.youtubeReputation.reasons.join(', ') : '')).trim()
```

---

## 확인 명령

- `pwd && find .. -name AGENTS.md -print`
- `cat AGENTS.md && printf '\n--- files ---\n' && find . -maxdepth 3 \( -path './node_modules' -o -path './.git' \) -prune -o -type f | sed 's#^./##' | sort | rg '(^js/|^api/|youtube|ranking|image_text_policy_patch)'`
- `rg -n "changeSort|sort" js/image_text_policy_patch.js`
- `find . -maxdepth 4 \( -path './node_modules' -o -path './.git' \) -prune -o -type f | sed 's#^./##' | sort | rg -i 'youtube'`
- `rg -n "youtube|YouTube|googleapis|youtube/v3|viewCount|order|popular|인기" api lib js -g '*.js'`
- `rg -n "인기|popular|youtubeScore|viewCount|youtube|YouTube|score" js/ranking.js`
- `nl -ba js/image_text_policy_patch.js | sed -n '126,163p;169,177p;179,203p'`
- `nl -ba api/search.js | sed -n '1,8p;91,101p;377,389p'`
- `nl -ba lib/youtubeReputation.js | sed -n '1,6p;82,106p;254,305p'`
- `nl -ba js/ranking.js | sed -n '303,312p;529,532p;746,758p;888,890p;962,965p'`
- `git status --short`
