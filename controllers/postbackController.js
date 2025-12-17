const db = require("../config/db");

const axios = require("axios");

exports.handlePostback = (req, res) => {
  const { clickid, conversion_id, payout } = req.query;

  if (!clickid) {
    return res.status(400).json({ error: "clickid required" });
  }

  // 1️⃣ Find click by advertiser_click_id
  db.query(
    "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
    [clickid],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(400).json({ error: "Click not found" });
      }

      const click = rows[0];

      // 2️⃣ Insert conversion
      db.query(
        `INSERT INTO conversions 
         (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', NOW())`,
        [
          click.campaign_id,
          click.click_id,
          click.advertiser_click_id,
          conversion_id || null,
          payout || 0,
          click.publisher_id,
        ],
        (err2, result) => {
          if (err2) {
            console.error("Conversion insert failed", err2);
            return res.status(500).json({ error: "Conversion save failed" });
          }

          const conversionId = result.insertId;

          // 3️⃣ Update wallet
          db.query(
            "INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, ?, ?)",
            [click.publisher_id, conversionId, payout || 0]
          );

          // 4️⃣ AUTO fire publisher postback (ASYNC – non-blocking)
          firePublisherPostback({
            campaign_id: click.campaign_id,
            publisher_id: click.publisher_id,
            click_id: click.click_id,
            payout: payout || 0,
          });

          // 5️⃣ Respond advertiser immediately
          return res.json({ message: "Conversion saved" });
        }
      );
    }
  );
};


function firePublisherPostback({ campaign_id, publisher_id, click_id, payout }) {
  db.query(
    `SELECT postback_url 
     FROM publisher_links
     WHERE campaign_id = ? AND publisher_id = ?
     LIMIT 1`,
    [campaign_id, publisher_id],
    async (err, rows) => {
      if (err || rows.length === 0) return;

      let postbackUrl = rows[0].postback_url;

      if (!postbackUrl) return;

      // Replace macros
      postbackUrl = postbackUrl
        .replace("{click_id}", click_id)
        .replace("{payout}", payout);

      try {
        await axios.get(postbackUrl, { timeout: 4000 });
        console.log("✅ Publisher postback fired:", postbackUrl);
      } catch (e) {
        console.error("❌ Publisher postback failed:", postbackUrl);
      }
    }
  );
}


// exports.handlePostback = (req, res) => {
//   const { clickid, conversion_id, payout } = req.query;

//   db.query(
//     "SELECT * FROM clicks WHERE advertiser_click_id = ?",
//     [clickid],
//     (err, rows) => {
//       if (err || rows.length === 0)
//         return res.status(400).json({ error: "Click not found" });

//       const click = rows[0];

//       db.query(
//         `INSERT INTO conversions (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id)
//          VALUES (?, ?, ?, ?, ?, ?)`,
//         [
//           click.campaign_id,
//           click.click_id,
//           click.advertiser_click_id,
//           conversion_id,
//           payout,
//           click.publisher_id,
//         ]
//       );

//       db.query(
//         "INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, LAST_INSERT_ID(), ?)",
//         [click.publisher_id, payout]
//       );

//       res.json({ message: "Conversion saved" });
//     }
//   );
// };