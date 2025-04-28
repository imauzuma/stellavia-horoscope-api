// ─────────────────────────────────────────────
//  Stellavia Horoscope API  –  server.js
//  （swisseph-v2 対応版）
// ─────────────────────────────────────────────
const express  = require('express');
const cors     = require('cors');
const swisseph = require('swisseph-v2');          // ← ① ここだけライブラリ名変更

// ─ Ephemeris ファイルの場所（任意）
//   Moshier 内蔵 ephemeris で十分ならコメントのままで OK。
//   精度を上げたい場合、環境変数 EPHE_PATH に
//   ftp://www.astro.com/pub/swisseph/ephe で落としたファイル群を置く。
if (process.env.EPHE_PATH) {
  swisseph.swe_set_ephe_path(process.env.EPHE_PATH);
}

// 位置計算で使うフラグ
const FLAGS = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;   // ← ② 追加

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// 星座計算ユーティリティ
// ─────────────────────────────────────────────
const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

const getZodiacSign   = deg => SIGNS[Math.floor(deg / 30)];
const getPolarityDeg  = deg => (deg + 180) % 360;

// ─────────────────────────────────────────────
// メイン API
// ─────────────────────────────────────────────
app.post('/api/chart', async (req, res) => {
  try {
    const { birthDate, birthTime, latitude, longitude, timezoneOffset } = req.body;

    if (
      !birthDate || !birthTime ||
      latitude  === undefined ||
      longitude === undefined ||
      timezoneOffset === undefined
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ------------------------------------------
    // 日時 → Julian Day (UT) へ
    // ------------------------------------------
    const [year, month, day]   = birthDate.split('-').map(Number);
    const [hour, minute]       = birthTime.split(':').map(Number);
    const utcHour              = hour - timezoneOffset;           // JST(+9)なら -9

    const jd = swisseph.swe_julday(
      year, month, day,
      utcHour + minute / 60,
      swisseph.SE_GREG_CAL
    );

    // ------------------------------------------
    // 惑星・ノード計算
    // ------------------------------------------
    const pluto      = await calcPlanet(jd, swisseph.SE_PLUTO);
    const northNode  = await calcPlanet(jd, swisseph.SE_TRUE_NODE);
    const nodeRuler  = await calcPlanet(jd, swisseph.SE_SUN);     // 仮: 太陽を北ノードのルーラー

    // Polarity Point
    const plutoPPDeg  = getPolarityDeg(pluto.lon);
    const plutoPPSign = getZodiacSign(plutoPPDeg);

    // ------------------------------------------
    // レスポンス
    // ------------------------------------------
    res.json({
      pluto: {
        sign  : getZodiacSign(pluto.lon),
        degree: pluto.lon
      },
      plutoPolarityPoint: {
        sign  : plutoPPSign,
        degree: plutoPPDeg
      },
      nodes: {
        north: {
          sign  : getZodiacSign(northNode.lon),
          degree: northNode.lon
        },
        south: {
          sign  : getZodiacSign(getPolarityDeg(northNode.lon)),
          degree: getPolarityDeg(northNode.lon)
        }
      },
      nodeRulers: {
        north: {
          planet: 'Sun',
          sign  : getZodiacSign(nodeRuler.lon),
          degree: nodeRuler.lon
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────
function calcPlanet(jd, planetConst) {
  return new Promise((resolve, reject) => {
    swisseph.swe_calc_ut(jd, planetConst, FLAGS, body => {
      if (body.error) return reject(body.error);
      resolve({ lon: body.longitude });
    });
  });
}

// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
