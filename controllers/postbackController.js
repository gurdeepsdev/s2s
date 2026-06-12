// const db = require("../config/db");
// const axios = require("axios");




// exports.handlePostback = async (req, res) => {
//   try {
//     // 🔹 Capture Full Incoming URL
//     const incomingUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

//     // 🔹 Capture IP Address
//     const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

//     // 🔹 Capture User Agent
//     const userAgent = req.headers['user-agent'];

//     console.log("📥 Incoming Postback URL:", incomingUrl);
//     console.log("🌍 IP:", ipAddress);
//     console.log("🧠 User Agent:", userAgent);

//    // const { click_id, conversion_id, payout, event_goal, event, p1,p2,p3,p4,p5  } = req.query;

//     // const { click_id, conversion_id, payout, event_goal, event,p1,p2,p3,p4,p5 } = req.query;
//     let { click_id, conversion_id, payout, event_goal, event,p1,p2,p3,p4,p5 } = req.query;

//     // treat empty event as install
//     event = event && event.trim() !== "" ? event : "install";    // let { click_id, conversion_id, payout, event_goal, event } = req.query;


//     if (!click_id) {
//       return res.status(400).json({ error: "clickid required" });
//     }

//    // 🔹 Sanitize payout (OPTIONAL FIELD)
//     const numericPayout = parseFloat(payout);
//     let finalPayout = null;

//     if (!isNaN(numericPayout)) {
//       finalPayout = numericPayout;
//     }


//     // 1️⃣ Find click
//     const [clickRows] = await db.promise().query(
//       "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
//       [click_id]
//     );

//     if (clickRows.length === 0) {
//       return res.status(400).json({ error: "Click not found" });
//     }

//     const click = clickRows[0];



//     // 2️⃣ Insert conversion (SAVE BOTH event_goal + event)
//     const [conversionResult] = await db.promise().query(
//       `INSERT INTO conversions
//        (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id, event_goal, event, status, incomingUrl,p1,p2,p3,p4,p5, created_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?, NOW())`,
//       [
//         click.campaign_id,
//         click.click_id,
//         click.advertiser_click_id,
//         conversion_id || null,
//         finalPayout,              // can be NULL safely
//         click.publisher_id,
//         event_goal || null,   // OLD FIELD
//         event || null,        // NEW FIELD
//         'received',
//         incomingUrl,
//         p1,p2,p3,p4,p5 
//       ]
//     );

//     const conversionId = conversionResult.insertId;
//     console.log("✅ Conversion saved:", conversionId);

//     /**
//      * From here onward use ONLY `event`
//      * event_goal remains untouched for old logic & reports
//      */

//     // 3️⃣ Count today's conversions (NEW event-based logic)
//     const [[{ total }]] = await db.promise().query(
//       `SELECT COUNT(*) AS total
//        FROM conversions
//        WHERE campaign_id = ?
//        AND event = ?
//        AND DATE(created_at) = CURDATE()`,
//       [click.campaign_id, event]
//     );

//     console.log("📊 Total conversions today (event):", total);
 


//     // 4️⃣ First 2 conversions always fire
//     if (total <= 10) {
//       firePublisherPostback({
//         campaign_id: click.campaign_id,
//         publisher_id: click.publisher_id,
//         click_id: click.click_id,
//         payout: finalPayout ?? 0,   // send 0 if invalid
//         event
//       });

//       return res.json({ message: "Conversion saved & fired (initial pass)" });
//     }

//     // 5️⃣ pass_post_back check
//     const [[passRule]] = await db.promise().query(
//       `SELECT is_pass FROM pass_post_back
//        WHERE campaign_id = ? AND event_name = ? LIMIT 1`,
//       [click.campaign_id, event]
//     );

//     if (!passRule || passRule.is_pass === 0) {
//       console.log("🚫 Blocked by pass_post_back");
//       return res.json({ message: "Conversion saved (event blocked)" });
//     }

//     // 6️⃣ Sampling logic after 5 conversions
//     if (total >= 20) {
//       const [[samplingRule]] = await db.promise().query(
//         `SELECT sampling_percentage FROM sampling
//          WHERE campaign_id = ? AND event_name = ? LIMIT 1`,
//         [click.campaign_id, event]
//       );

//       const samplingPercentage = samplingRule?.sampling_percentage || 100;
//       const rand = Math.random() * 100;

//       if (rand <= samplingPercentage) {
//         firePublisherPostback({
//           campaign_id: click.campaign_id,
//           publisher_id: click.publisher_id,
//           click_id: click.click_id,
//           payout: finalPayout ?? 0,   // send 0 if invalid
//           event
//         });

//         return res.json({ message: "Conversion fired (sampling pass)" });
//       } else {
//         console.log("⛔ Dropped by sampling");
//         return res.json({ message: "Conversion saved (sampling dropped)" });
//       }
//     }

//     // 7️⃣ Cooldown phase (3rd & 4th conversion)
//     return res.json({ message: "Conversion saved (cooldown phase)" });

//   } catch (err) {
//     console.error("❌ Postback handler error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };




// async function firePublisherPostback({ campaign_id, publisher_id, click_id, payout, event }) {
//   try {

//     if (!click_id) {
//       console.log("❌ Missing click_id. Postback skipped.");
//       return;
//     }

//     const [rows] = await db.promise().query(
//       `SELECT postback_url
//        FROM publisher_links
//        WHERE campaign_id = ? AND publisher_id = ?
//        LIMIT 1`,
//       [campaign_id, publisher_id]
//     );

// console.log(rows,"new",campaign_id,publisher_id)
//     if (!rows.length || !rows[0].postback_url) {
//       console.log("❌ No postback_url found for campaign:", campaign_id);
//       return;
//     }

//     let finalUrl = rows[0].postback_url
//       .replace(/{click_id}|{cid}/g, click_id)
//       .replace(/{payout}/g, payout || 0)
//       .replace(/{event}/g, event || '');

//     console.log("🚀 Final Postback URL:", finalUrl);

//     await axios.get(finalUrl, { timeout: 4000 });

//     console.log("✅ Publisher postback fired:", finalUrl);

//   } catch (e) {
//     console.error("❌ Publisher postback failed:", e.message);
//   }
// }


// //async function firePublisherPostback({ campaign_id, publisher_id, click_id, payout, event }) {
//   //try {
//     //const [rows] = await db.promise().query(
//       //`SELECT postback_url
//        //FROM publisher_links
//        //WHERE campaign_id = ? AND publisher_id = ?
//        //LIMIT 1`,
//       //[campaign_id, publisher_id]
//     //);

//     //if (!rows.length) return;

//     //let finalUrl = rows[0].postback_url
//       //.replace("{click_id}", click_id)
//       //.replace("{payout}", payout)
//       //.replace("{event}", event);

//     //await axios.get(finalUrl, { timeout: 4000 });

//     //console.log("✅ Publisher postback fired:", finalUrl);
//   //} catch (e) {
//     //console.error("❌ Publisher postback failed:", e.message);
//   //}
// //}










// exports.handlePostbacks = async (req, res) => {
//   try {
//     const { click_id, conversion_id, payout, event_goal } = req.query;

//     if (!click_id) {
//       return res.status(400).json({ error: "clickid required" });
//     }

//     // 1️⃣ Find click
//     const [clickRows] = await db.promise().query(
//       "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
//       [click_id]
//     );

//     if (clickRows.length === 0) {
//       return res.status(400).json({ error: "Click not found" });
//     }

//     const click = clickRows[0];

//     // 2️⃣ Insert conversion
//     const [conversionResult] = await db.promise().query(
//       `INSERT INTO conversions
//        (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id, event_goal, status, created_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', NOW())`,
//       [
//         click.campaign_id,
//         click.click_id,
//         click.advertiser_click_id,
//         conversion_id || null,
//         payout || 0,
//         click.publisher_id,
//         event_goal
//       ]
//     );

//     const conversionId = conversionResult.insertId;
//     console.log("✅ Conversion saved:", conversionId);

//     // 3️⃣ Insert wallet (SAFE)
//     //try {
//       //await db.promise().query(
//         //"INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, ?, ?)",
//         //[click.publisher_id, conversionId, payout || 0]
//       //);
//       //console.log("✅ Wallet credited");
//     //} catch (walletErr) {
//       //console.error("❌ Wallet insert failed:", walletErr.sqlMessage);
//     //}

//     // 4️⃣ Fire publisher postback (ASYNC, non-blocking)
//     firePublisherPostback({
//       campaign_id: click.campaign_id,
//       publisher_id: click.publisher_id,
//       click_id: click.click_id,
//       payout: payout || 0,
//     });

//     // 5️⃣ Respond advertiser
//     return res.json({ message: "Conversion saved" });

//   } catch (err) {
//     console.error("❌ Postback handler error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };


// // 🔁 Publisher postback trigger
// async function firePublisherPostbacks({ campaign_id, publisher_id, click_id, payout }) {
//   try {
//     console.log("🔔 Checking publisher postback:", { campaign_id, publisher_id,click_id });

//     const [rows] = await db.promise().query(
//       `SELECT postback_url
//        FROM publisher_links
//        WHERE campaign_id = ? AND publisher_id = ?
//        LIMIT 1`,
//       [campaign_id, publisher_id]
//     );

//     if (rows.length === 0) {
//       console.log("ℹ️ Publisher link row not found");
//       return;
//     }

//     const postbackUrl = rows[0].postback_url;
// console.log("Publisher postback URL:", postbackUrl);

//     if (!postbackUrl) {
//       console.log("ℹ️ Publisher postback URL not configured");
//       return;
//     }

//     const finalUrl = postbackUrl
//       .replace("{click_id}", click_id)
//       .replace("{payout}", payout);

//     await axios.get(finalUrl, { timeout: 4000 });
//     console.log("✅ Publisher postback fired:", finalUrl);

//   } catch (e) {
//     console.error("❌ Publisher postback failed:", e.message);
//   }
// }


// exports.updatePlaceLink = (req, res) => {
//   try {
//     const { pub_id, user_id, place_link } = req.body;
// console.log("api hit",req.body);

//     // ✅ Basic validation
//     if (!pub_id || !user_id || !place_link) {
//       return res.status(400).json({
//         success: false,
//         message: 'pub_id, user_id, and place_link are required'
//       });
//     }

//     const sql = `
//       UPDATE publisher_links
//       SET postback_url = ?, user_id = ?, updated_at = NOW()
//       WHERE publisher_id = ?
//     `;
//     console.log("query running");

//     db.query(sql, [place_link, user_id, pub_id], (err, result) => {
//       if (err) {
//         console.error('updatePlaceLink DB error:', err);
//         return res.status(500).json({
//           success: false,
//           message: 'Database error'
//         });
//       }

// console.log("all and done",result);

//       if (result.affectedRows === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'Publisher not found'
//         });
//       }

//       return res.json({
//         success: true,
//         message: 'Postback URL updated successfully'
//       });
//     });

//   } catch (error) {
//     console.error('updatePlaceLink error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };



// // exports.handlePostback = (req, res) => {
// //   const { clickid, conversion_id, payout } = req.query;

// //   db.query(
// //     "SELECT * FROM clicks WHERE advertiser_click_id = ?",
// //     [clickid],
// //     (err, rows) => {
// //       if (err || rows.length === 0)
// //         return res.status(400).json({ error: "Click not found" });

// //       const click = rows[0];

// //       db.query(
// //         `INSERT INTO conversions (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id)
// //          VALUES (?, ?, ?, ?, ?, ?)`,
// //         [
// //           click.campaign_id,
// //           click.click_id,
// //           click.advertiser_click_id,
// //           conversion_id,
// //           payout,
// //           click.publisher_id,
// //         ]
// //       );

// //       db.query(
// //         "INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, LAST_INSERT_ID(), ?)",
// //         [click.publisher_id, payout]
// //       );

// //       res.json({ message: "Conversion saved" });
// //     }
// //   );
// // };


const db = require("../config/db");
const axios = require("axios");




exports.handlePostback = async (req, res) => {
  try {
    // 🔹 Capture Full Incoming URL
    const incomingUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

    // 🔹 Capture IP Address
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 🔹 Capture User Agent
    const userAgent = req.headers['user-agent'];

    console.log("📥 Incoming Postback URL:", incomingUrl);
    console.log("🌍 IP:", ipAddress);
    console.log("🧠 User Agent:", userAgent);

   // const { click_id, conversion_id, payout, event_goal, event, p1,p2,p3,p4,p5  } = req.query;

    // const { click_id, conversion_id, payout, event_goal, event,p1,p2,p3,p4,p5 } = req.query;
    let { click_id, conversion_id, payout, event_goal, event,p1,p2,p3,p4,p5 } = req.query;

    // treat empty event as install
    event = event && event.trim() !== "" ? event : "install";    // let { click_id, conversion_id, payout, event_goal, event } = req.query;


    if (!click_id) {
      return res.status(400).json({ error: "clickid required" });
    }

   // 🔹 Sanitize payout (OPTIONAL FIELD)
   const numericPayout = parseFloat(payout);

   let finalPayout = payout || "0";

   if (
       payout === undefined ||
       payout === null ||
       payout === "" ||
       payout === "{payout}"
   ) {
       finalPayout = "0";
   }

console.log("RAW PAYOUT:", payout);
console.log("FINAL PAYOUT:", finalPayout);

console.log("POSTBACK CLICK ID:", click_id);

    // 1️⃣ Find click
    const [clickRows] = await db.promise().query(
      "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
      [click_id]
    );
    console.log("CLICK MATCH COUNT:", clickRows.length);


    if (clickRows.length === 0) {
      return res.status(400).json({ error: "Click not found" });
    }
    console.log("✅ CLICK FOUND:", {
      campaign_id: clickRows[0].campaign_id,
      advertiser_click_id: clickRows[0].advertiser_click_id,
      click_id: clickRows[0].click_id
    });

    const click = clickRows[0];

    // 2️⃣ VTA (View-Through Attribution) check
    // If the click carries a gaid/idfa, look for a matching impression
    // within 24 h BEFORE the click on the same campaign.
    // This tells us the user saw the ad before clicking.
    let vtaImpression = null;
    const vtaDeviceId = click.gaid || click.idfa || null;

    if (vtaDeviceId) {
      const [vtaRows] = await db.promise().query(
        `SELECT id, imp_id, publisher_id, created_at
         FROM impressions
         WHERE campaign_id = ?
           AND (gaid = ? OR idfa = ?)
           AND created_at >= NOW() - INTERVAL 24 HOUR
           AND created_at <= ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [click.campaign_id, vtaDeviceId, vtaDeviceId, click.created_at]
      );

      if (vtaRows.length > 0) {
        vtaImpression = vtaRows[0];
        console.log('👁️ VTA match found — imp_id:', vtaImpression.imp_id,
          '| impression publisher:', vtaImpression.publisher_id,
          '| click publisher:', click.publisher_id);
      } else {
        console.log('ℹ️ No VTA impression found for device:', vtaDeviceId);
      }
    }

    // 3️⃣ Insert conversion (include VTA fields)
    const [conversionResult] = await db.promise().query(
      `INSERT INTO conversions
       (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id,
        event_goal, event, status, incomingUrl, p1, p2, p3, p4, p5,
        vta_imp_id, vta_impression_publisher_id, attribution_type,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        click.campaign_id,
        click.click_id,
        click.advertiser_click_id,
        conversion_id || null,
      finalPayout || 0,
        click.publisher_id,
        event_goal || null,
        event || null,
        'received',
        incomingUrl,
        p1, p2, p3, p4, p5,
        vtaImpression ? vtaImpression.imp_id         : null,
        vtaImpression ? vtaImpression.publisher_id   : null,
        vtaImpression ? 'view_through'               : 'click_through'
      ]
    );

    const conversionId = conversionResult.insertId;
    console.log('✅ Conversion saved:', conversionId,
      '| attribution:', vtaImpression ? 'view_through' : 'click_through');

    /**
     * From here onward use ONLY `event`
     * event_goal remains untouched for old logic & reports
     */

    // 3️⃣ Count today's conversions (NEW event-based logic)
    const [[{ total }]] = await db.promise().query(
      `SELECT COUNT(*) AS total
       FROM conversions
       WHERE campaign_id = ?
       AND event = ?
       AND DATE(created_at) = CURDATE()`,
      [click.campaign_id, event]
    );

    console.log("📊 Total conversions today (event):", total);
 


    // 4️⃣ First 2 conversions always fire
    if (total <= 10) {
      firePublisherPostback({
        campaign_id: click.campaign_id,
        publisher_id: click.publisher_id,
        click_id: click.click_id,
        payout: finalPayout ?? 0,   // send 0 if invalid
        event
      });

      return res.json({ message: "Conversion saved & fired (initial pass)" });
    }

    // 5️⃣ pass_post_back check
    const [[passRule]] = await db.promise().query(
      `SELECT is_pass FROM pass_post_back
       WHERE campaign_id = ? AND event_name = ? LIMIT 1`,
      [click.campaign_id, event]
    );

    if (!passRule || passRule.is_pass === 0) {
      console.log("🚫 Blocked by pass_post_back");
      return res.json({ message: "Conversion saved (event blocked)" });
    }

    // 6️⃣ Sampling logic after 5 conversions
    if (total >= 20) {
      const [[samplingRule]] = await db.promise().query(
        `SELECT sampling_percentage FROM sampling
         WHERE campaign_id = ? AND event_name = ? LIMIT 1`,
        [click.campaign_id, event]
      );

      const samplingPercentage = samplingRule?.sampling_percentage || 100;
      const rand = Math.random() * 100;

      if (rand <= samplingPercentage) {
        firePublisherPostback({
          campaign_id: click.campaign_id,
          publisher_id: click.publisher_id,
          click_id: click.click_id,
          payout: finalPayout ?? 0,   // send 0 if invalid
          event
        });

        return res.json({ message: "Conversion fired (sampling pass)" });
      } else {
        console.log("⛔ Dropped by sampling");
        return res.json({ message: "Conversion saved (sampling dropped)" });
      }
    }

    // 7️⃣ Cooldown phase (3rd & 4th conversion)
    return res.json({ message: "Conversion saved (cooldown phase)" });

  } catch (err) {
    console.error("❌ Postback handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};




async function firePublisherPostback({ campaign_id, publisher_id, click_id, payout, event }) {
  try {

    if (!click_id) {
      console.log("❌ Missing click_id. Postback skipped.");
      return;
    }

    const [rows] = await db.promise().query(
      `SELECT postback_url
       FROM publisher_links
       WHERE campaign_id = ? AND publisher_id = ?
       LIMIT 1`,
      [campaign_id, publisher_id]
    );

console.log(rows,"new",campaign_id,publisher_id)
    if (!rows.length || !rows[0].postback_url) {
      console.log("❌ No postback_url found for campaign:", campaign_id);
      return;
    }

    let finalUrl = rows[0].postback_url
      .replace(/{click_id}|{cid}/g, click_id)
      .replace(/{payout}/g, payout || 0)
      .replace(/{event}/g, event || '');

    console.log("🚀 Final Postback URL:", finalUrl);

    await axios.get(finalUrl, { timeout: 4000 });

    console.log("✅ Publisher postback fired:", finalUrl);

  } catch (e) {
    console.error("❌ Publisher postback failed:", e.message);
  }
}










exports.handlePostbacks = async (req, res) => {
  try {
    const { click_id, conversion_id, payout, event_goal } = req.query;

    if (!click_id) {
      return res.status(400).json({ error: "clickid required" });
    }

    // 1️⃣ Find click
    const [clickRows] = await db.promise().query(
      "SELECT * FROM clicks WHERE advertiser_click_id = ? LIMIT 1",
      [click_id]
    );

    if (clickRows.length === 0) {
      return res.status(400).json({ error: "Click not found" });
    }

    const click = clickRows[0];

    // 2️⃣ Insert conversion
    const [conversionResult] = await db.promise().query(
      `INSERT INTO conversions
       (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id, event_goal, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', NOW())`,
      [
        click.campaign_id,
        click.click_id,
        click.advertiser_click_id,
        conversion_id || null,
        payout || 0,
        click.publisher_id,
        event_goal
      ]
    );

    const conversionId = conversionResult.insertId;
    console.log("✅ Conversion saved:", conversionId);

    // 3️⃣ Insert wallet (SAFE)
    //try {
      //await db.promise().query(
        //"INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, ?, ?)",
        //[click.publisher_id, conversionId, payout || 0]
      //);
      //console.log("✅ Wallet credited");
    //} catch (walletErr) {
      //console.error("❌ Wallet insert failed:", walletErr.sqlMessage);
    //}

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
async function firePublisherPostbacks({ campaign_id, publisher_id, click_id, payout }) {
  try {
    console.log("🔔 Checking publisher postback:", { campaign_id, publisher_id,click_id });

    const [rows] = await db.promise().query(
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
console.log("Publisher postback URL:", postbackUrl);

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

console.log("all and done",result);

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
