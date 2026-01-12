const db = require("../config/db");
const axios = require("axios");

exports.handlePostback = async (req, res) => {
  try {
    const { clickid, conversion_id, payout } = req.query;

    if (!clickid) {
      return res.status(400).json({ error: "clickid required" });
    }

    // 1️⃣ Find click
    const [clickRows] = await db.query(
      "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
      [clickid]
    );

    if (clickRows.length === 0) {
      return res.status(400).json({ error: "Click not found" });
    }

    const click = clickRows[0];

    // 2️⃣ Insert conversion
    const [conversionResult] = await db.query(
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
      ]
    );

    const conversionId = conversionResult.insertId;
    console.log("✅ Conversion saved:", conversionId);

    // 3️⃣ Insert wallet (SAFE)
    try {
      await db.query(
        "INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, ?, ?)",
        [click.publisher_id, conversionId, payout || 0]
      );
      console.log("✅ Wallet credited");
    } catch (walletErr) {
      console.error("❌ Wallet insert failed:", walletErr.sqlMessage);
    }

    // 4️⃣ Fire publisher postback (ASYNC, non-blocking)
    firePublisherPostback({
      campaign_id: click.campaign_id,
      publisher_id: click.publisher_id,
      click_id: click.click_id,
      payout: payout || 0,
    });

    // 5️⃣ Respond advertiser
    return res.json({ message: "Conversion saved" });

  } catch (err) {
    console.error("❌ Postback handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// 🔁 Publisher postback trigger
async function firePublisherPostback({ campaign_id, publisher_id, click_id, payout }) {
  try {
    console.log("🔔 Checking publisher postback:", { campaign_id, publisher_id });

    const [rows] = await db.query(
      `SELECT postback_url
       FROM publisher_links
       WHERE campaign_id = ? AND publisher_id = ?
       LIMIT 1`,
      [campaign_id, publisher_id]
    );

    if (rows.length === 0) {
      console.log("ℹ️ Publisher link row not found");
      return;
    }

    const postbackUrl = rows[0].postback_url;

    if (!postbackUrl) {
      console.log("ℹ️ Publisher postback URL not configured");
      return;
    }

    const finalUrl = postbackUrl
      .replace("{click_id}", click_id)
      .replace("{payout}", payout);

    await axios.get(finalUrl, { timeout: 4000 });
    console.log("✅ Publisher postback fired:", finalUrl);

  } catch (e) {
    console.error("❌ Publisher postback failed:", e.message);
  }
}


exports.updatePlaceLink = (req, res) => {
  try {
    const { pub_id, user_id, place_link } = req.body;
console.log("api hit",req.body);

    // ✅ Basic validation
    if (!pub_id || !user_id || !place_link) {
      return res.status(400).json({
        success: false,
        message: 'pub_id, user_id, and place_link are required'
      });
    }

    const sql = `
      UPDATE publisher_links
      SET postback_url = ?, user_id = ?, updated_at = NOW()
      WHERE publisher_id = ?
    `;
    console.log("query running");

    db.query(sql, [place_link, user_id, pub_id], (err, result) => {
      if (err) {
        console.error('updatePlaceLink DB error:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Publisher not found'
        });
      }

      return res.json({
        success: true,
        message: 'Postback URL updated successfully'
      });
    });

  } catch (error) {
    console.error('updatePlaceLink error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};



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