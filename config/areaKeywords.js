/**
 * 모두투어 지역 키워드 상수
 * 총 268개
 */

// 유니온 (지역 그룹) - 56개
const AREA_UNION = {
  TOKYO: 6806, // 동경
  OSAKA: 6811, // 오사카
  KYUSHU: 6812, // 큐슈
  HOKKAIDO: 6813, // 북해도
  SHIKOKU_CHUGOKU: 6814, // 시코쿠/주고쿠
  TOHOKU: 6815, // 도호쿠
  MONGOLIA: 6829, // 몽골/내몽고
  EUROPE_WEST: 6837, // 서유럽
  EUROPE_EAST: 6838, // 동유럽
  BALKAN: 6839, // 발칸(크로아티아/슬로베니아)
  SPAIN_PORTUGAL: 6840, // 스페인/포르투갈
  MIDDLE_EAST: 6841, // 중동
  EUROPE_NORTH: 6842, // 북유럽
  CAUCASUS: 6843, // 코카서스 3국
  HAWAII: 6845, // 하와이
  AMERICA_WEST: 6846, // 미서부
  AMERICA_EAST: 6847, // 미동부
  MIDDLE_AND_SOUTH_AMERICA: 6848, // 중남미/멕시코
  ALYESHKA: 6850, // 알래스카
  INDIA_NEPAL: 6940, // 인도/네팔/스리랑카
  ALPENROUTE: 6942, // 알펜루트
  OKINAWA: 6943, // 오키나와
  TURKIYE: 6947, // 튀르키예
  EGYPT: 6948, // 이집트
  GREECE: 6949, // 그리스
  MAURITIUS: 6950, // 아프리카/모리셔스
  MALDIVES: 6952, // 몰디브
  DAEGU_ASIA: 28592, // 대구 - 동남아
  JEJU_ASIA: 28862, // 제주 - 동남아
  JEJU_JAPAN: 28863, // 제주 - 일본
  JEJU_CHINA: 28869, // 제주 - 중국
  BUSAN_ASIA: 28892, // 부산 - 동남아
  BUSAN_JAPAN: 28893, // 부산 - 일본
  BUSAN_CHINA: 28894, // 부산 - 중국/몽골/홍콩마카오
  BUSAN_OCEANIA: 28895, // 부산 - 남태평양
  CHEONGJU_ASIA: 28896, // 청주 - 동남아
  CHEONGJU_JAPAN: 28897, // 청주 - 일본
  CHEONGJU_CHINA: 28898, // 청주 - 중국
  DAEGU_JAPAN: 28900, // 대구 - 일본
  DAEGU_CHAINA: 28901, // 대구 - 중국
  KUNMING: 597552, // 곤명/여강
  CENTRAL_ASIA: 597555, // 중앙아시아
  ZHANGJIAJIE: 611958, // 장가계
  HONGKONG_MACAU: 611959, // 홍콩/마카오
  QINGDAO: 611960, // 청도/위해/연태
  SHANGHAI_BEIJING: 611961, // 상해/북경
  MOUNT_PAEKTU: 611962, // 백두산
  GUILIN: 611963, // 계림/침주/광저우
  MOUNT_HUANGSHAN: 611964, // 황산
  TAIHANG_MOUNTAINS: 611965, // 태항산
  XIAMEN: 611966, // 하문
  DALIAN_HARBIN: 611967, // 대련/하얼빈
  XIAN_URUMQI: 611968, // 서안/우루무치
  CHENGDU: 611969, // 성도/구채구/티벳
  CHONGQING: 611971, // 중경/은시/귀양
  MALAYSIA_BRUNEI: 611986, // 말레이시아/브루나이
};

// 국가 - 60개
const AREA_COUNTRY = {
  VIETNAM: 7, // 베트남
  TAIWAN_PROVINCE_OF_CHINA: 181, // 대만
  MAURITIUS: 188, // 모리셔스
  GERMANY: 200, // 독일
  GREECE: 201, // 그리스
  SPAIN: 206, // 스페인
  FINLAND: 215, // 핀란드
  BHUTAN: 227, // 부탄
  KAZAKHSTAN: 236, // 카자흐스탄
  ICELAND: 239, // 아이슬란드
  CANADA: 249, // 캐나다
  NEPAL: 250, // 네팔
  INDONESIA: 251, // 인도네시아
  MACAO: 259, // 마카오
  SWEDEN: 262, // 스웨덴
  UNITED_KINGDOM: 264, // 영국
  NEW_ZEALAND: 274, // 뉴질랜드
  GUAM: 280, // 괌
  CZECH_REPUBLIC: 291, // 체코공화국
  OMAN: 307, // 오만
  ITALY: 308, // 이탈리아
  AUSTRIA: 310, // 오스트리아
  HUNGARY: 316, // 헝가리
  AZERBAIJAN: 318, // 아제르바이잔
  MEXICO: 319, // 멕시코
  FRANCE: 321, // 프랑스
  JORDAN: 324, // 요르단
  CHILE: 325, // 칠레
  SLOVENIA: 327, // 슬로베니아
  PERU: 328, // 페루
  MONGOLIA: 330, // 몽골
  LAOS: 336, // 라오스
  EGYPT: 342, // 이집트
  BRUNEI_DARUSSALAM: 347, // 브루나이
  SRI_LANKA: 353, // 스리랑카
  BRAZIL: 355, // 브라질
  KYRGYZSTAN: 359, // 키르기스스탄
  ARGENTINA: 363, // 아르헨티나
  SWITZERLAND: 364, // 스위스
  CAMBODIA: 365, // 캄보디아
  ARMENIA: 368, // 아르메니아
  MALDIVES: 369, // 몰디브
  TURKEY: 370, // 튀르키예
  THAILAND: 372, // 태국
  NETHERLANDS: 373, // 네덜란드
  DENMARK: 374, // 덴마크
  PHILIPPINES: 377, // 필리핀
  PORTUGAL: 390, // 포르투갈
  INDIA: 396, // 인도
  SINGAPORE: 397, // 싱가포르
  HONG_KONG: 400, // 홍콩
  NORWAY: 401, // 노르웨이
  QATAR: 402, // 카타르
  MOROCCO: 406, // 모로코
  UZBEKISTAN: 408, // 우즈베키스탄
  AUSTRALIA: 409, // 호주
  SAUDI_ARABIA: 421, // 사우디아라비아
  CROATIA: 425, // 크로아티아
  SAIPAN: 6600, // 사이판
  GEORGIA: 6844, // 조지아
};

// 도시 - 152개
const AREA_CITY = {
  OSAKA: 4, // 오사카
  SHENZHEN: 5, // 심천
  WASHINGTON: 9, // 워싱턴
  TAIPEI: 13, // 타이페이
  TOKYO: 16, // 도쿄
  KITAKYUSHU: 29, // 기타큐슈
  PATTAYA: 33, // 파타야
  YELLOWSTONE_NATIONAL_PARK: 52, // 옐로스톤
  NIAGARA_FALLS: 63, // 나이아가라
  MELBOURNE: 67, // 멜버른
  HONGKONG: 73, // 홍콩
  KUALALUMPUR: 77, // 쿠알라룸푸르
  VIENTIANE: 78, // 비엔티엔
  AUCKLAND: 79, // 오클랜드
  KUMAMOTO: 80, // 구마모토
  BRISBANE: 81, // 브리즈번
  TOTTORI: 83, // 돗토리
  KALIBO: 84, // 보라카이
  OITA: 86, // 오이타
  QUEBECCITY: 87, // 퀘벡
  VANCOUVER: 89, // 밴쿠버
  SAIPAN: 92, // 사이판
  KAUAI: 93, // 카우아이
  DALIAN: 94, // 대련
  BOHOL: 95, // 보홀
  SANFRANCISCO: 96, // 샌프란시스코
  SIMYANG: 99, // 심양
  KOTA_KINABALU: 101, // 코타키나발루
  KAGOSHIMA: 103, // 가고시마
  BEIJING: 106, // 북경
  SIEM_REAP: 107, // 씨엠립
  BANGKOK: 110, // 방콕
  HANOI: 111, // 하노이
  NEWYORK: 112, // 뉴욕
  FUKUOKA: 120, // 후쿠오카
  SYDNEY: 121, // 시드니
  MIYAZAKI: 122, // 미야자키
  ABUDHABI: 123, // 아부다비
  GUANGZHOU: 124, // 광저우
  SHANGHAI: 127, // 상해
  NHATRANG: 129, // 나트랑
  CEBU: 131, // 세부
  GUAM: 132, // 괌
  WEIHAI: 133, // 위해
  YUNGI: 134, // 연길
  QINGDAO: 135, // 청도
  PHUKET: 136, // 푸켓
  DUBAI: 137, // 두바이
  DANANG: 138, // 다낭
  HONOLULU: 140, // 호놀룰루
  SAPPORO: 141, // 삿포로
  LASVEGAS: 145, // 라스베가스
  BALI: 149, // 발리
  SINGAPORE: 150, // 싱가포르
  YANTAI: 151, // 연태
  OKINAWA: 155, // 오키나와
  TORONTO: 156, // 토론토
  HAIPHONG: 158, // 하이퐁
  DALAT: 159, // 달랏
  MACAU: 160, // 마카오
  NAGOYA: 162, // 나고야
  NIAGARA_FALLS: 164, // 나이아가라
  LOSANGELES: 165, // 로스앤젤레스
  MANILA: 168, // 마닐라
  HOCHIMINHCITY: 172, // 호치민
  OBIHIRO: 439, // 오비히로
  ZHENGZHOU: 491, // 정주
  KOBE: 525, // 고베
  CHENGDU: 534, // 성도
  CLARK_FIELD_LUZON: 621, // 클락
  SHIZUOKA: 728, // 시즈오카
  CHANGCHUN: 747, // 장춘
  HANGZHOU: 886, // 항주
  LIJIANGCITY: 1122, // 여강
  BANFF: 1169, // 밴프
  TAICHUNG: 1228, // 타이중
  JINAN: 1273, // 제남
  KAOHSIUNG: 1322, // 가오슝
  FUZHOU: 1362, // 복주
  OKAYAMA: 1383, // 오카야마
  DAYONG: 1516, // 장가계
  KYOTO: 1563, // 교토
  KAHULUI: 1568, // 마우이
  TOYAMA: 1874, // 도야마
  GUIYANG: 2149, // 귀양
  KUNMING: 2349, // 곤명
  CALGARY: 2396, // 캘거리
  KOMATSU: 2511, // 고마츠
  SAGA: 2532, // 사가
  TUNXI: 2550, // 황산
  YICHANG: 2629, // 의창
  NAGASAKI: 2963, // 나가사키
  YELLOWKNIFE: 3072, // 옐로우나이프
  NIIGATA: 3119, // 니가타
  YONAGO: 3177, // 요나고
  CHIANGRAI: 3204, // 치앙라이
  GOLDCOAST: 3312, // 골드코스트
  HAKODATE: 3787, // 하코다테
  CANCUN: 3880, // 칸쿤
  CHONQING: 4099, // 중경
  GUILIN: 4111, // 계림
  KOH_SAMUI: 4239, // 코사무이
  HEFEI: 4282, // 합비
  XIAN: 4347, // 서안
  CHRISTCHURCH: 4717, // 크라이스트처치
  HIROSHIMA: 4768, // 히로시마
  WUHAN: 4802, // 무한
  LOMBOK: 4922, // 롬복
  MIYAKO: 4964, // 미야코지마
  SENDAI: 5041, // 센다이
  LHASA: 5099, // 라싸
  CHIANGMAI: 5154, // 치앙마이
  ISHIGAKI: 5358, // 이시가키
  LUANGPRABANG: 5426, // 루앙프라방
  TOKUSHIMA: 5432, // 도쿠시마
  HARBIN: 5521, // 하얼빈
  MATSUYAMA: 5609, // 마츠야마
  TAKAMATSU: 5622, // 다카마츠
  PHUQUOC: 5723, // 푸꾸옥
  CHANGSHA: 5868, // 장사
  JAKARTA: 5935, // 자카르타
  MANADO: 6113, // 마나도
  XIAMEN: 6159, // 하문
  BATAMBATUBESAR: 6301, // 바탐
  AOMORI: 6549, // 아오모리
  HAKONE: 6604, // 하코네
  NOBORIBETSU: 6605, // 노보리베츠
  OTARU: 6606, // 오타루
  BIG_ISLAND: 6611, // 빅아일랜드
  YUFUIN: 6623, // 유후인
  BEPPU: 6624, // 벳부
  KHAO_LAK: 6766, // 카오락
  KANCHANABURI: 6767, // 칸차나부리
  HALONG_BAY: 6768, // 하롱베이
  MUI_NE: 6769, // 무이네
  NIKKO: 6770, // 닛꼬
  NARA: 6771, // 나라
  DOYA: 6773, // 도야
  FURANO: 6774, // 후라노
  BIEI: 6775, // 비에이
  TSUSHIMA_ISLAND: 6776, // 대마도
  SHIMONOSEKI: 6777, // 시모노세키
  VANG_VIENG: 6787, // 방비엥
  SAPA: 6836, // 사파
  BAEKDUSAN_MOUNTAIN: 6944, // 백두산
  JIUZHAIGOU: 6945, // 구채구
  TAIHANG: 6946, // 태항산
  WAKAYAMA: 6955, // 와카야마
  JOZANKEI: 6956, // 죠잔케이
  CHENZHOU: 28864, // 침주
  INNER_MONGOLIA: 496836, // 내몽고
  UNKNOWN_597240: 597240, // 은시
};

// 전체 지역 매핑 (areaKeywordNo -> 정보)
const AREA_MAP = {
  4: { koreanName: "오사카", englishName: "Osaka", type: "도시" },
  5: { koreanName: "심천", englishName: "Shenzhen", type: "도시" },
  7: { koreanName: "베트남", englishName: "Vietnam", type: "국가" },
  9: { koreanName: "워싱턴", englishName: "Washington", type: "도시" },
  13: { koreanName: "타이페이", englishName: "Taipei", type: "도시" },
  16: { koreanName: "도쿄", englishName: "Tokyo", type: "도시" },
  29: { koreanName: "기타큐슈", englishName: "Kitakyushu", type: "도시" },
  33: { koreanName: "파타야", englishName: "Pattaya", type: "도시" },
  52: { koreanName: "옐로스톤", englishName: "Yellowstone National Park", type: "도시" },
  63: { koreanName: "나이아가라", englishName: "Niagara falls", type: "도시" },
  67: { koreanName: "멜버른", englishName: "Melbourne", type: "도시" },
  73: { koreanName: "홍콩", englishName: "Hongkong", type: "도시" },
  77: { koreanName: "쿠알라룸푸르", englishName: "Kualalumpur", type: "도시" },
  78: { koreanName: "비엔티엔", englishName: "Vientiane", type: "도시" },
  79: { koreanName: "오클랜드", englishName: "Auckland", type: "도시" },
  80: { koreanName: "구마모토", englishName: "Kumamoto", type: "도시" },
  81: { koreanName: "브리즈번", englishName: "Brisbane", type: "도시" },
  83: { koreanName: "돗토리", englishName: "Tottori", type: "도시" },
  84: { koreanName: "보라카이", englishName: "Kalibo", type: "도시" },
  86: { koreanName: "오이타", englishName: "Oita", type: "도시" },
  87: { koreanName: "퀘벡", englishName: "Quebeccity", type: "도시" },
  89: { koreanName: "밴쿠버", englishName: "Vancouver", type: "도시" },
  92: { koreanName: "사이판", englishName: "Saipan", type: "도시" },
  93: { koreanName: "카우아이", englishName: "KAUAI", type: "도시" },
  94: { koreanName: "대련", englishName: "Dalian", type: "도시" },
  95: { koreanName: "보홀", englishName: "Bohol", type: "도시" },
  96: { koreanName: "샌프란시스코", englishName: "Sanfrancisco", type: "도시" },
  99: { koreanName: "심양", englishName: "Simyang", type: "도시" },
  101: { koreanName: "코타키나발루", englishName: "Kota kinabalu", type: "도시" },
  103: { koreanName: "가고시마", englishName: "Kagoshima", type: "도시" },
  106: { koreanName: "북경", englishName: "Beijing", type: "도시" },
  107: { koreanName: "씨엠립", englishName: "Siem reap", type: "도시" },
  110: { koreanName: "방콕", englishName: "Bangkok", type: "도시" },
  111: { koreanName: "하노이", englishName: "Hanoi", type: "도시" },
  112: { koreanName: "뉴욕", englishName: "Newyork", type: "도시" },
  120: { koreanName: "후쿠오카", englishName: "Fukuoka", type: "도시" },
  121: { koreanName: "시드니", englishName: "Sydney", type: "도시" },
  122: { koreanName: "미야자키", englishName: "Miyazaki", type: "도시" },
  123: { koreanName: "아부다비", englishName: "Abudhabi", type: "도시" },
  124: { koreanName: "광저우", englishName: "Guangzhou", type: "도시" },
  127: { koreanName: "상해", englishName: "Shanghai", type: "도시" },
  129: { koreanName: "나트랑", englishName: "Nhatrang", type: "도시" },
  131: { koreanName: "세부", englishName: "Cebu", type: "도시" },
  132: { koreanName: "괌", englishName: "Guam", type: "도시" },
  133: { koreanName: "위해", englishName: "Weihai", type: "도시" },
  134: { koreanName: "연길", englishName: "Yungi", type: "도시" },
  135: { koreanName: "청도", englishName: "Qingdao", type: "도시" },
  136: { koreanName: "푸켓", englishName: "Phuket", type: "도시" },
  137: { koreanName: "두바이", englishName: "Dubai", type: "도시" },
  138: { koreanName: "다낭", englishName: "Danang", type: "도시" },
  140: { koreanName: "호놀룰루", englishName: "Honolulu", type: "도시" },
  141: { koreanName: "삿포로", englishName: "Sapporo", type: "도시" },
  145: { koreanName: "라스베가스", englishName: "Lasvegas", type: "도시" },
  149: { koreanName: "발리", englishName: "Bali", type: "도시" },
  150: { koreanName: "싱가포르", englishName: "Singapore", type: "도시" },
  151: { koreanName: "연태", englishName: "Yantai", type: "도시" },
  155: { koreanName: "오키나와", englishName: "Okinawa", type: "도시" },
  156: { koreanName: "토론토", englishName: "Toronto", type: "도시" },
  158: { koreanName: "하이퐁", englishName: "Haiphong", type: "도시" },
  159: { koreanName: "달랏", englishName: "Dalat", type: "도시" },
  160: { koreanName: "마카오", englishName: "Macau", type: "도시" },
  162: { koreanName: "나고야", englishName: "Nagoya", type: "도시" },
  164: { koreanName: "나이아가라", englishName: "Niagara falls", type: "도시" },
  165: { koreanName: "로스앤젤레스", englishName: "Losangeles", type: "도시" },
  168: { koreanName: "마닐라", englishName: "Manila", type: "도시" },
  172: { koreanName: "호치민", englishName: "Hochiminhcity", type: "도시" },
  181: { koreanName: "대만", englishName: "Taiwan, Province Of China", type: "국가" },
  188: { koreanName: "모리셔스", englishName: "Mauritius", type: "국가" },
  200: { koreanName: "독일", englishName: "Germany", type: "국가" },
  201: { koreanName: "그리스", englishName: "Greece", type: "국가" },
  206: { koreanName: "스페인", englishName: "Spain", type: "국가" },
  215: { koreanName: "핀란드", englishName: "Finland", type: "국가" },
  227: { koreanName: "부탄", englishName: "Bhutan", type: "국가" },
  236: { koreanName: "카자흐스탄", englishName: "Kazakhstan", type: "국가" },
  239: { koreanName: "아이슬란드", englishName: "Iceland", type: "국가" },
  249: { koreanName: "캐나다", englishName: "Canada", type: "국가" },
  250: { koreanName: "네팔", englishName: "Nepal", type: "국가" },
  251: { koreanName: "인도네시아", englishName: "Indonesia", type: "국가" },
  259: { koreanName: "마카오", englishName: "Macao", type: "국가" },
  262: { koreanName: "스웨덴", englishName: "Sweden", type: "국가" },
  264: { koreanName: "영국", englishName: "United Kingdom", type: "국가" },
  274: { koreanName: "뉴질랜드", englishName: "New Zealand", type: "국가" },
  280: { koreanName: "괌", englishName: "Guam", type: "국가" },
  291: { koreanName: "체코공화국", englishName: "Czech Republic", type: "국가" },
  307: { koreanName: "오만", englishName: "Oman", type: "국가" },
  308: { koreanName: "이탈리아", englishName: "Italy", type: "국가" },
  310: { koreanName: "오스트리아", englishName: "Austria", type: "국가" },
  316: { koreanName: "헝가리", englishName: "Hungary", type: "국가" },
  318: { koreanName: "아제르바이잔", englishName: "Azerbaijan", type: "국가" },
  319: { koreanName: "멕시코", englishName: "Mexico", type: "국가" },
  321: { koreanName: "프랑스", englishName: "France", type: "국가" },
  324: { koreanName: "요르단", englishName: "Jordan", type: "국가" },
  325: { koreanName: "칠레", englishName: "Chile", type: "국가" },
  327: { koreanName: "슬로베니아", englishName: "Slovenia", type: "국가" },
  328: { koreanName: "페루", englishName: "Peru", type: "국가" },
  330: { koreanName: "몽골", englishName: "Mongolia", type: "국가" },
  336: { koreanName: "라오스", englishName: "Lao People&#39S Democratic Republic", type: "국가" },
  342: { koreanName: "이집트", englishName: "Egypt", type: "국가" },
  347: { koreanName: "브루나이", englishName: "Brunei Darussalam", type: "국가" },
  353: { koreanName: "스리랑카", englishName: "Sri Lanka", type: "국가" },
  355: { koreanName: "브라질", englishName: "Brazil", type: "국가" },
  359: { koreanName: "키르기스스탄", englishName: "Kyrgyzstan", type: "국가" },
  363: { koreanName: "아르헨티나", englishName: "Argentina", type: "국가" },
  364: { koreanName: "스위스", englishName: "Switzerland", type: "국가" },
  365: { koreanName: "캄보디아", englishName: "Cambodia", type: "국가" },
  368: { koreanName: "아르메니아", englishName: "Armenia", type: "국가" },
  369: { koreanName: "몰디브", englishName: "Maldives", type: "국가" },
  370: { koreanName: "튀르키예", englishName: "Turkey", type: "국가" },
  372: { koreanName: "태국", englishName: "Thailand", type: "국가" },
  373: { koreanName: "네덜란드", englishName: "Netherlands", type: "국가" },
  374: { koreanName: "덴마크", englishName: "Denmark", type: "국가" },
  377: { koreanName: "필리핀", englishName: "Philippines", type: "국가" },
  390: { koreanName: "포르투갈", englishName: "Portugal", type: "국가" },
  396: { koreanName: "인도", englishName: "India", type: "국가" },
  397: { koreanName: "싱가포르", englishName: "Singapore", type: "국가" },
  400: { koreanName: "홍콩", englishName: "Hong Kong", type: "국가" },
  401: { koreanName: "노르웨이", englishName: "Norway", type: "국가" },
  402: { koreanName: "카타르", englishName: "Qatar", type: "국가" },
  406: { koreanName: "모로코", englishName: "Morocco", type: "국가" },
  408: { koreanName: "우즈베키스탄", englishName: "Uzbekistan", type: "국가" },
  409: { koreanName: "호주", englishName: "Australia", type: "국가" },
  421: { koreanName: "사우디아라비아", englishName: "Saudi Arabia", type: "국가" },
  425: { koreanName: "크로아티아", englishName: "Croatia", type: "국가" },
  439: { koreanName: "오비히로", englishName: "Obihiro", type: "도시" },
  491: { koreanName: "정주", englishName: "Zhengzhou", type: "도시" },
  525: { koreanName: "고베", englishName: "Kobe", type: "도시" },
  534: { koreanName: "성도", englishName: "Chengdu", type: "도시" },
  621: { koreanName: "클락", englishName: "CLARK FIELD LUZON", type: "도시" },
  728: { koreanName: "시즈오카", englishName: "Shizuoka", type: "도시" },
  747: { koreanName: "장춘", englishName: "Changchun", type: "도시" },
  886: { koreanName: "항주", englishName: "Hangzhou", type: "도시" },
  1122: { koreanName: "여강", englishName: "Lijiangcity", type: "도시" },
  1169: { koreanName: "밴프", englishName: "Banff", type: "도시" },
  1228: { koreanName: "타이중", englishName: "Taichung", type: "도시" },
  1273: { koreanName: "제남", englishName: "Jinan", type: "도시" },
  1322: { koreanName: "가오슝", englishName: "Kaohsiung", type: "도시" },
  1362: { koreanName: "복주", englishName: "Fuzhou", type: "도시" },
  1383: { koreanName: "오카야마", englishName: "Okayama", type: "도시" },
  1516: { koreanName: "장가계", englishName: "Dayong", type: "도시" },
  1563: { koreanName: "교토", englishName: "Kyoto", type: "도시" },
  1568: { koreanName: "마우이", englishName: "Kahului", type: "도시" },
  1874: { koreanName: "도야마", englishName: "Toyama", type: "도시" },
  2149: { koreanName: "귀양", englishName: "Guiyang", type: "도시" },
  2349: { koreanName: "곤명", englishName: "Kunming", type: "도시" },
  2396: { koreanName: "캘거리", englishName: "Calgary", type: "도시" },
  2511: { koreanName: "고마츠", englishName: "Komatsu", type: "도시" },
  2532: { koreanName: "사가", englishName: "Saga", type: "도시" },
  2550: { koreanName: "황산", englishName: "Tunxi", type: "도시" },
  2629: { koreanName: "의창", englishName: "Yichang", type: "도시" },
  2963: { koreanName: "나가사키", englishName: "Nagasaki", type: "도시" },
  3072: { koreanName: "옐로우나이프", englishName: "Yellowknife", type: "도시" },
  3119: { koreanName: "니가타", englishName: "Niigata", type: "도시" },
  3177: { koreanName: "요나고", englishName: "Yonago", type: "도시" },
  3204: { koreanName: "치앙라이", englishName: "Chiangrai", type: "도시" },
  3312: { koreanName: "골드코스트", englishName: "Goldcoast", type: "도시" },
  3787: { koreanName: "하코다테", englishName: "Hakodate", type: "도시" },
  3880: { koreanName: "칸쿤", englishName: "Cancun", type: "도시" },
  4099: { koreanName: "중경", englishName: "Chonqing", type: "도시" },
  4111: { koreanName: "계림", englishName: "Guilin", type: "도시" },
  4239: { koreanName: "코사무이", englishName: "Koh Samui", type: "도시" },
  4282: { koreanName: "합비", englishName: "Hefei", type: "도시" },
  4347: { koreanName: "서안", englishName: "Xian", type: "도시" },
  4717: { koreanName: "크라이스트처치", englishName: "Christchurch", type: "도시" },
  4768: { koreanName: "히로시마", englishName: "Hiroshima", type: "도시" },
  4802: { koreanName: "무한", englishName: "Wuhan", type: "도시" },
  4922: { koreanName: "롬복", englishName: "Lombok", type: "도시" },
  4964: { koreanName: "미야코지마", englishName: "Miyako", type: "도시" },
  5041: { koreanName: "센다이", englishName: "Sendai", type: "도시" },
  5099: { koreanName: "라싸", englishName: "Lhasa", type: "도시" },
  5154: { koreanName: "치앙마이", englishName: "Chiangmai", type: "도시" },
  5358: { koreanName: "이시가키", englishName: "Ishigaki", type: "도시" },
  5426: { koreanName: "루앙프라방", englishName: "Luangprabang", type: "도시" },
  5432: { koreanName: "도쿠시마", englishName: "Tokushima", type: "도시" },
  5521: { koreanName: "하얼빈", englishName: "Harbin", type: "도시" },
  5609: { koreanName: "마츠야마", englishName: "Matsuyama", type: "도시" },
  5622: { koreanName: "다카마츠", englishName: "Takamatsu", type: "도시" },
  5723: { koreanName: "푸꾸옥", englishName: "Phuquoc", type: "도시" },
  5868: { koreanName: "장사", englishName: "Changsha", type: "도시" },
  5935: { koreanName: "자카르타", englishName: "Jakarta", type: "도시" },
  6113: { koreanName: "마나도", englishName: "Manado", type: "도시" },
  6159: { koreanName: "하문", englishName: "Xiamen", type: "도시" },
  6301: { koreanName: "바탐", englishName: "Batambatubesar", type: "도시" },
  6549: { koreanName: "아오모리", englishName: "Aomori", type: "도시" },
  6600: { koreanName: "사이판", englishName: "Saipan", type: "국가" },
  6604: { koreanName: "하코네", englishName: "Hakone", type: "도시" },
  6605: { koreanName: "노보리베츠", englishName: "Noboribetsu", type: "도시" },
  6606: { koreanName: "오타루", englishName: "Otaru", type: "도시" },
  6611: { koreanName: "빅아일랜드", englishName: "Big Island", type: "도시" },
  6623: { koreanName: "유후인", englishName: "Yufuin", type: "도시" },
  6624: { koreanName: "벳부", englishName: "Beppu", type: "도시" },
  6766: { koreanName: "카오락", englishName: "Khao Lak", type: "도시" },
  6767: { koreanName: "칸차나부리", englishName: "Kanchanaburi", type: "도시" },
  6768: { koreanName: "하롱베이", englishName: "Halong Bay", type: "도시" },
  6769: { koreanName: "무이네", englishName: "Mui Ne", type: "도시" },
  6770: { koreanName: "닛꼬", englishName: "Nikko", type: "도시" },
  6771: { koreanName: "나라", englishName: "Nara", type: "도시" },
  6773: { koreanName: "도야", englishName: "Doya", type: "도시" },
  6774: { koreanName: "후라노", englishName: "Furano", type: "도시" },
  6775: { koreanName: "비에이", englishName: "Biei", type: "도시" },
  6776: { koreanName: "대마도", englishName: "Tsushima Island", type: "도시" },
  6777: { koreanName: "시모노세키", englishName: "Shimonoseki", type: "도시" },
  6787: { koreanName: "방비엥", englishName: "Vang Vieng", type: "도시" },
  6806: { koreanName: "동경", englishName: "Tokyo", type: "유니온" },
  6811: { koreanName: "오사카", englishName: "Osaka", type: "유니온" },
  6812: { koreanName: "큐슈", englishName: "Kyushu", type: "유니온" },
  6813: { koreanName: "북해도", englishName: "Hokkaido", type: "유니온" },
  6814: { koreanName: "시코쿠/주고쿠", englishName: "Shikoku/Chugoku", type: "유니온" },
  6815: { koreanName: "도호쿠", englishName: "Tohoku", type: "유니온" },
  6829: { koreanName: "몽골/내몽고", englishName: "Mongolia", type: "유니온" },
  6836: { koreanName: "사파", englishName: "Sapa", type: "도시" },
  6837: { koreanName: "서유럽", englishName: "Europe West", type: "유니온" },
  6838: { koreanName: "동유럽", englishName: "Europe East", type: "유니온" },
  6839: { koreanName: "발칸(크로아티아/슬로베니아)", englishName: "Balkan", type: "유니온" },
  6840: { koreanName: "스페인/포르투갈", englishName: "Spain/Portugal", type: "유니온" },
  6841: { koreanName: "중동", englishName: "Middle East", type: "유니온" },
  6842: { koreanName: "북유럽", englishName: "Europe North", type: "유니온" },
  6843: { koreanName: "코카서스 3국", englishName: "Caucasus", type: "유니온" },
  6844: { koreanName: "조지아", englishName: "Georgia", type: "국가" },
  6845: { koreanName: "하와이", englishName: "Hawaii", type: "유니온" },
  6846: { koreanName: "미서부", englishName: "America West", type: "유니온" },
  6847: { koreanName: "미동부", englishName: "America East", type: "유니온" },
  6848: { koreanName: "중남미/멕시코", englishName: "Middle and South America", type: "유니온" },
  6850: { koreanName: "알래스카", englishName: "Alyeshka", type: "유니온" },
  6940: { koreanName: "인도/네팔/스리랑카", englishName: "India/Nepal", type: "유니온" },
  6942: { koreanName: "알펜루트", englishName: "alpenroute", type: "유니온" },
  6943: { koreanName: "오키나와", englishName: "Okinawa", type: "유니온" },
  6944: { koreanName: "백두산", englishName: "Baekdusan Mountain", type: "도시" },
  6945: { koreanName: "구채구", englishName: "Jiuzhaigou", type: "도시" },
  6946: { koreanName: "태항산", englishName: "Taihang", type: "도시" },
  6947: { koreanName: "튀르키예", englishName: "Turkiye", type: "유니온" },
  6948: { koreanName: "이집트", englishName: "Egypt", type: "유니온" },
  6949: { koreanName: "그리스", englishName: "Greece", type: "유니온" },
  6950: { koreanName: "아프리카/모리셔스", englishName: "Mauritius", type: "유니온" },
  6952: { koreanName: "몰디브", englishName: "Maldives", type: "유니온" },
  6955: { koreanName: "와카야마", englishName: "Wakayama", type: "도시" },
  6956: { koreanName: "죠잔케이", englishName: "Jozankei", type: "도시" },
  28592: { koreanName: "대구 - 동남아", englishName: "Daegu_Asia", type: "유니온" },
  28862: { koreanName: "제주 - 동남아", englishName: "Jeju_Asia", type: "유니온" },
  28863: { koreanName: "제주 - 일본", englishName: "Jeju_Japan", type: "유니온" },
  28864: { koreanName: "침주", englishName: "Chenzhou", type: "도시" },
  28869: { koreanName: "제주 - 중국", englishName: "Jeju_China", type: "유니온" },
  28892: { koreanName: "부산 - 동남아", englishName: "Busan_Asia", type: "유니온" },
  28893: { koreanName: "부산 - 일본", englishName: "Busan_Japan", type: "유니온" },
  28894: { koreanName: "부산 - 중국/몽골/홍콩마카오", englishName: "Busan_China", type: "유니온" },
  28895: { koreanName: "부산 - 남태평양", englishName: "Busan_Oceania", type: "유니온" },
  28896: { koreanName: "청주 - 동남아", englishName: "Cheongju_Asia", type: "유니온" },
  28897: { koreanName: "청주 - 일본", englishName: "Cheongju_Japan", type: "유니온" },
  28898: { koreanName: "청주 - 중국", englishName: "Cheongju_China", type: "유니온" },
  28900: { koreanName: "대구 - 일본", englishName: "Daegu_Japan", type: "유니온" },
  28901: { koreanName: "대구 - 중국", englishName: "Daegu_Chaina", type: "유니온" },
  496836: { koreanName: "내몽고", englishName: "Inner Mongolia", type: "도시" },
  597240: { koreanName: "은시", englishName: "", type: "도시" },
  597552: { koreanName: "곤명/여강", englishName: "Kunming", type: "유니온" },
  597555: { koreanName: "중앙아시아", englishName: "Central Asia", type: "유니온" },
  611958: { koreanName: "장가계", englishName: "Zhangjiajie", type: "유니온" },
  611959: { koreanName: "홍콩/마카오", englishName: "HongKong/Macau", type: "유니온" },
  611960: { koreanName: "청도/위해/연태", englishName: "Qingdao", type: "유니온" },
  611961: { koreanName: "상해/북경", englishName: "Shanghai/Beijing", type: "유니온" },
  611962: { koreanName: "백두산", englishName: "Mount Paektu", type: "유니온" },
  611963: { koreanName: "계림/침주/광저우", englishName: "Guilin", type: "유니온" },
  611964: { koreanName: "황산", englishName: "Mount Huangshan", type: "유니온" },
  611965: { koreanName: "태항산", englishName: "Taihang Mountains", type: "유니온" },
  611966: { koreanName: "하문", englishName: "Xiamen", type: "유니온" },
  611967: { koreanName: "대련/하얼빈", englishName: "Dalian/Harbin", type: "유니온" },
  611968: { koreanName: "서안/우루무치", englishName: "Xian/Urumqi", type: "유니온" },
  611969: { koreanName: "성도/구채구/티벳", englishName: "Chengdu", type: "유니온" },
  611971: { koreanName: "중경/은시/귀양", englishName: "Chongqing", type: "유니온" },
  611986: { koreanName: "말레이시아/브루나이", englishName: "Malaysia/Brunei", type: "유니온" },
};

module.exports = {
  AREA_UNION,
  AREA_COUNTRY,
  AREA_CITY,
  AREA_MAP,
};

