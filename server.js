const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 星座を判定する関数
function getZodiacSign(degree) {
  const signs = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ];
  return signs[Math.floor(degree / 30)];
}

// 180度反対の座標（Polarity Point）を求める
function getPolarityDegree(degree) {
  let polarity = degree + 180;
  if (polarity >= 360) polarity -= 360;
  return polarity;
}

// メインのAPIエンドポイント
app.post('/api/chart', async (req, res) => {
  try {
    const { birthDate, birthTime, latitude, longitude, timezoneOffset } = req.body;

    if (!birthDate || !birthTime || latitude === undefined || longitude === undefined || timezoneOffset === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 生年月日と時間をパース
    const [year, month, day] = birthDate.split('-').map(Number);
    const [hour, minute] = birthTime.split(':').map(Number);
    const utcHour = hour - timezoneOffset;

    // Julian Dayを計算
    const julianDay = swisseph.swe_julday(year, month, day, utcHour + minute / 60, swisseph.SE_GREG_CAL);

    // 天体たちを計算
    const pluto = await calculatePlanet(julianDay, swisseph.SE_PLUTO);
    const northNode = await calculatePlanet(julianDay, swisseph.SE_TRUE_NODE);

    // Pluto Polarity Pointを計算
    const plutoPolarityDegree = getPolarityDegree(pluto.longitude);
    const plutoPolaritySign = getZodiacSign(plutoPolarityDegree);

    // 仮に太陽をNorth Node支配星とみなす（本来はルーラーを動的判定）
    const northNodeRuler = await calculatePlanet(julianDay, swisseph.SE_SUN);

    // 出力フォーマット
    const result = {
      pluto: {
        sign: getZodiacSign(pluto.longitude),
        degree: pluto.longitude
      },
      plutoPolarityPoint: {
        sign: plutoPolaritySign,
        degree: plutoPolarityDegree
      },
      nodes: {
        north: {
          sign: getZodiacSign(northNode.longitude),
          degree: northNode.longitude
        },
        south: {
          sign: getZodiacSign(getPolarityDegree(northNode.longitude)),
          degree: getPolarityDegree(northNode.longitude)
        }
      },
      nodeRulers: {
        north: {
          planet: "Sun",
          sign: getZodiacSign(northNodeRuler.longitude),
          degree: northNodeRuler.longitude
        }
        // 南ノード支配星も後で追加できる！
      }
    };

    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 天体の位置を非同期で取得する関数
function calculatePlanet(jd, planet) {
  return new Promise((resolve, reject) => {
    swisseph.swe_calc_ut(jd, planet, (ret) => {
      if (ret.error) reject(ret.error);
      else resolve({ longitude: ret.longitude });
    });
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
