const db = require("../config/db");
const crypto = require("crypto");
const axios = require("axios");


// ⭐ Your base postback route
const POSTBACK_BASE = "https://track.pidmetric.com/postback"; 
// change to your actual domain later
// Generate unique advertiser key
function generateAdvertiserKey() {
  return "ADV-" + crypto.randomBytes(4).toString("hex");
}

exports.saveAdvertiserLink = (req, res) => {
  const { campaign_id, advertiser_link, adv_id, click_id_param ,pubid} = req.body;

  if (!campaign_id  || !adv_id || !click_id_param) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // 1️⃣ Check if advertiser already exists (by pubid)
  db.query(
    `SELECT adv_key, postback_url 
     FROM advertiser_links 
     WHERE adv_id = ?
     LIMIT 1`,
    [adv_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err });

      let advKey, postbackURL;

      // 2️⃣ Reuse if exists
      if (rows.length > 0) {
        advKey = rows[0].adv_key;
        postbackURL = rows[0].postback_url;
      } 
      // 3️⃣ Create if not exists
      else {
        advKey = generateAdvertiserKey();
        postbackURL =
          `${POSTBACK_BASE}?${click_id_param}={click_id}&payout={payout}&adv_key=${advKey}`;
      }

      // 4️⃣ ALWAYS insert new row with new advertiser_link
      const insertSQL = `
        INSERT INTO advertiser_links
        (campaign_id, advertiser_link, click_id_param, postback_url, adv_key, adv_id,pubid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSQL,
        [
          campaign_id,
          advertiser_link,
          click_id_param,
          postbackURL,
          advKey,
          adv_id,
          pubid
        ],
        (err2, result) => {
          if (err2) return res.status(500).json({ error: err2 });

          return res.json({
            message: rows.length > 0
              ? "Advertiser link added with existing adv_key"
              : "Advertiser created & link added",
            adv_key: advKey,
            postback_url: postbackURL,
            advertiser_link
          });
        }
      );
    }
  );
};



// exports.saveAdvertiserLink = (req, res) => {
//   const { campaign_id, advertiser_link, pubid,click_id_param } = req.body;

//   if (!campaign_id || !advertiser_link || !pubid) {
//     return res.status(400).json({ message: "Missing required fields" });
//   }

//   // Unique advertiser identifier
//   const advertiserKey = generateAdvertiserKey();

//   // Correct postback – NO advertiser click ID
//   const generatedPostback =
//     `${POSTBACK_BASE}?${click_id_param}={click_id}&payout={payout}&adv_key=${advertiserKey}`;

//   const sql = `
//     INSERT INTO advertiser_links 
//     (campaign_id, advertiser_link, click_id_param, postback_url, adv_key)
//     VALUES (?, ?, ?, ?, ?)
//   `;

//   db.query(
//     sql,
//     [campaign_id, advertiser_link, click_id_param, generatedPostback, advertiserKey],
//     (err, result) => {
//       if (err) return res.status(500).json({ error: err });

//       res.json({
//         message: "Advertiser link saved",
//         postback_url: generatedPostback,
//         adv_key: advertiserKey,
//       });
//     }
//   );
// };


// Generate Random Click ID
// Generate Random Internal Publisher Link ID
// function generatePublisherHandle() {
//   return "PU-" + crypto.randomBytes(4).toString("hex");
// }

// exports.generatePublisherLink = (req, res) => {
//   const { campaign_id, publisher_id } = req.body;

//   if (!campaign_id || !publisher_id) {
//     return res.status(400).json({ error: "campaign_id and publisher_id required" });
//   }

//   const publisherHandle = generatePublisherHandle();

//   // Publisher MUST replace {click_id} dynamically
//   const generatedLink = `https://pidmetric.com/click/${publisherHandle}?pub=${publisher_id}&cid={click_id}`;

//   const sql = `
//         INSERT INTO publisher_links (campaign_id, publisher_id, publisher_handle, generated_link)
//         VALUES (?, ?, ?, ?)
//     `;

//   db.query(sql, [campaign_id, publisher_id, publisherHandle, generatedLink], (err, result) => {
//     if (err) return res.status(500).json({ error: err });
// console.log(generatedLink);
//     res.json({
//       message: "Publisher link generated",
//       publisher_handle: publisherHandle,
//       publisher_link: generatedLink
//     });
//   });
// };

function generatePublisherHandle() {
  return "PU-" + crypto.randomBytes(4).toString("hex");
}

exports.generatePublisherLink = (req, res) => {
  const { campaign_id, publisher_id, hide_referrer } = req.body;

  if (!campaign_id || !publisher_id) {
    return res.status(400).json({ error: "campaign_id and publisher_id required" });
  }

  // 1️⃣ Check publisher identity
  db.query(
    `SELECT publisher_handle 
     FROM publisher_links 
     WHERE publisher_id = ?
     LIMIT 1`,
    [publisher_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err });

      const publisherHandle =
        rows.length > 0 ? rows[0].publisher_handle : generatePublisherHandle();

      // 2️⃣ Build tracking link (industry-style)
      const generatedLink =
        `https://track.pidmetric.com/click/${publisherHandle}` +
        `?campaign_id=${campaign_id}` +
        `&pub_id=${publisher_id}` +
        `&gaid={gaid}` +
        `&cid={click_id}` +
        `&sub_pub={sub_pub}` +
        `&source={source}`;

      // 3️⃣ Always insert new campaign row
      const insertSQL = `
        INSERT INTO publisher_links
        (campaign_id, publisher_id, publisher_handle, generated_link, hide_referrer)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.query(
        insertSQL,
        [campaign_id, publisher_id, publisherHandle, generatedLink, hide_referrer ? 1 : 0],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2 });

          return res.json({
            message: rows.length > 0
              ? "Publisher link added using existing handle"
              : "Publisher created & link added",
            publisher_handle: publisherHandle,
            publisher_link: generatedLink
          });
        }
      );
    }
  );
};


exports.handlePostback = async (req, res) => {
  try {
    const advertiserClickId = req.query.click_id;
    const payout = Number(req.query.payout || 0);
    const advKey = req.query.adv_key;

    if (!advertiserClickId || !advKey) {
      return res.status(400).send("Missing required params");
    }

    console.log("📩 Postback received:", advertiserClickId, advKey, payout);

    // 1️⃣ Validate advertiser
    const [advRows] = await db.promise().query(
      `SELECT campaign_id FROM advertiser_links WHERE adv_key = ? LIMIT 1`,
      [advKey]
    );

    if (advRows.length === 0) {
      return res.status(404).send("Invalid advertiser");
    }

    const campaignId = advRows[0].campaign_id;

    // 2️⃣ Find click
    const [clickRows] = await db.promise().query(
      `SELECT * FROM clicks 
       WHERE advertiser_click_id = ? AND campaign_id = ?
       LIMIT 1`,
      [advertiserClickId, campaignId]
    );

    if (clickRows.length === 0) {
      return res.status(404).send("Click not found");
    }

    const click = clickRows[0];

    // 3️⃣ Duplicate conversion protection
    const [dupCheck] = await db.promise().query(
      `SELECT id FROM conversions WHERE advertiser_click_id = ? LIMIT 1`,
      [advertiserClickId]
    );

    if (dupCheck.length > 0) {
      return res.status(200).send("Duplicate conversion ignored");
    }

    // 4️⃣ Insert conversion
    const [convResult] = await db.promise().query(
      `INSERT INTO conversions
       (click_id, advertiser_click_id, campaign_id, payout, publisher_id, adv_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'approved', NOW())`,
      [
        click.click_id,
        advertiserClickId,
        campaignId,
        payout,
        click.publisher_id,
        advKey
      ]
    );

    const conversionId = convResult.insertId;
    console.log("✅ Conversion saved:", conversionId);

    // 5️⃣ Insert wallet (independent of postback)
    try {
      await db.promise().query(
        `INSERT INTO wallet (publisher_id, conversion_id, amount)
         VALUES (?, ?, ?)`,
        [click.publisher_id, conversionId, payout]
      );
      console.log("✅ Wallet credited");
    } catch (walletErr) {
      console.error("❌ Wallet insert failed:", walletErr.sqlMessage);
    }

    // 6️⃣ Fire publisher postback (async, non-blocking)
    firePublisherPostback({
      campaign_id: campaignId,
      publisher_id: click.publisher_id,
      click_id: click.click_id,
      payout
    });

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ Postback handler error:", err);
    return res.status(500).send("Server error");
  }
};
async function firePublisherPostback({ campaign_id, publisher_id, click_id, payout }) {
  try {
    console.log("🔔 Checking publisher postback:", { campaign_id, publisher_id });

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


// exports.handlePostback = async (req, res) => {
//   try {
//     const advertiserClickId = req.query.click_id;
//     const payout = req.query.payout || 0;
//     const advKey = req.query.adv_key;  

//     if (!advertiserClickId || !advKey) {
//       return res.status(400).send("Missing required params");
//     }
// console.log("Postback received:", advertiserClickId,advKey,payout);
//     // 1️⃣ Validate advertiser using adv_key
//     const advSql = `SELECT * FROM advertiser_links WHERE adv_key = ? LIMIT 1`;
//     const [advRows] = await db.promise().query(advSql, [advKey]);

//     if (advRows.length === 0) {
//       return res.status(404).send("Invalid advertiser");
//     }

//     const campaignId = advRows[0].campaign_id;

//     // 2️⃣ Find internal click using advertiser click id
//     const clickSql = `
//       SELECT * FROM clicks 
//       WHERE advertiser_click_id = ? AND campaign_id = ? 
//       LIMIT 1
//     `;
//     const [clickRows] = await db.promise().query(clickSql, [advertiserClickId, campaignId]);

//     if (clickRows.length === 0) {
//       return res.status(404).send("Click not found");
//     }

//     const internalClickId = clickRows[0].click_id;

//     // 3️⃣ Prevent duplicate conversions
//     const dupSql = `
//       SELECT id FROM conversions 
//       WHERE advertiser_click_id = ? LIMIT 1
//     `;
//     const [dupCheck] = await db.promise().query(dupSql, [advertiserClickId]);

//     if (dupCheck.length > 0) {
//       return res.status(200).send("Duplicate conversion ignored");
//     }

//     // 4️⃣ Insert conversion
//     const insertSql = `
//       INSERT INTO conversions 
//       (click_id, advertiser_click_id, campaign_id, payout, adv_key)
//       VALUES (?, ?, ?, ?, ?)
//     `;

//     await db.promise().query(insertSql, [
//       internalClickId,
//       advertiserClickId,
//       campaignId,
//       payout,
//       advKey
//     ]);

//     res.status(200).send("OK");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server error");
//   }
// };
