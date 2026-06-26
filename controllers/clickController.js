const db = require("../config/db");

const crypto = require("crypto");
const { buildRedirectURL } = require("../utils/trackingHandler");



exports.trackClick = (req, res) => {
  const { publisher_handle} = req.params;
  const { cid, pub_id, subpub, gaid, idfa, source, campaign_id,p1,p2,p3,p4,p5 } = req.query;
console.log("campaign_id",campaign_id,publisher_handle)
  if (!campaign_id) {
    return res.status(400).send("Missing campaign_id");
  }
  if (!cid) {
    return res.status(400).send("Missing click id");
  }

  const advertiserClickId = "ADV-" + crypto.randomBytes(6).toString("hex");

  const ip_address =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  const user_agent = req.get("User-Agent");

  // 1️⃣ Find publisher link → campaign + publisher + hide_referrer
  db.query(
    `SELECT campaign_id, publisher_id, hide_referrer
     FROM publisher_links
     WHERE publisher_handle = ?
       AND campaign_id = ?
     LIMIT 1`,
    [publisher_handle, campaign_id],
    (err, pubRows) => {
      if (err || pubRows.length === 0) {
        return res.status(404).send("Invalid tracking link or campaign");
      }

      const { campaign_id, publisher_id, hide_referrer } = pubRows[0];

      // 2️⃣ Find advertiser link
      db.query(
        `SELECT advertiser_link, click_id_param
         FROM advertiser_links
         WHERE campaign_id = ?
         LIMIT 1`,
        [campaign_id],
        (err2, advRows) => {
          if (err2 || advRows.length === 0) {
            return res.status(404).send("No advertiser found");
          }

          const adv = advRows[0];

          // 3️⃣ Build redirect URL
          // let redirectURL = adv.advertiser_link;

          // if (redirectURL.includes("{click_id}")) {
          //   redirectURL = redirectURL.replace(
          //     "{click_id}",
          //     advertiserClickId
          //   );
          // } else {
          //   redirectURL +=
          //     (redirectURL.includes("?") ? "&" : "?") +
          //     `${adv.click_id_param}=${advertiserClickId}`;
          // }
         // 🔥 STEP 1: Replace placeholders FIRST

let advertiserLink = adv.advertiser_link;

// advertiserLink = advertiserLink
//   .replace(/{click_id}/g, advertiserClickId)
//   .replace(/{gaid}/g, gaid || "")
//   .replace(/{idfa}/g, idfa || "")
//   .replace(/{source}/g, source || "")
//   .replace(/{sub_pub}/g, subpub || "")
//   .replace(/{android_id}/g, gaid || "")
//   .replace(/{p4}/g, "")
//   .replace(/{af_ad_id}/g, "");

advertiserLink = advertiserLink
  .replace(/{click_id}/g, advertiserClickId)
  .replace(/{gaid}/g, gaid || "")
  .replace(/{idfa}/g, idfa || "")
  .replace(/{source}/g, source || "")
  .replace(/{sub_pub}/g, subpub || "")
  .replace(/{android_id}/g, gaid || "")
  .replace(/{p1}/g, p1 || "")
  .replace(/{p2}/g, p2 || "")
  .replace(/{p3}/g, p3 || "")
  .replace(/{p4}/g, p4 || "")
  .replace(/{p5}/g, p5 || "")
  .replace(/{af_ad_id}/g, "");
  
  console.log("ADVERTISER CLICK ID:", advertiserClickId);
  console.log("ORIGINAL ADVERTISER URL:", adv.advertiser_link);
console.log("AFTER REPLACEMENT:", advertiserLink);

  const redirectURL = buildRedirectURL({
    advertiser_link: advertiserLink,   // ✅ use cleaned URL
    advertiserClickId,
    source,
    adv
  });
  console.log("FINAL REDIRECT:", redirectURL);
// 🔥 DEBUG (IMPORTANT)
console.log("AFTER REPLACEMENT:", advertiserLink);

console.log("INPUT PARAMS:", { source, gaid, idfa });
          console.log("FINAL REDIRECT:", redirectURL);

          // 4️⃣ Save click
          const insertSQL = `
            INSERT INTO clicks
            (click_id, publisher_id, campaign_id, advertiser_click_id,
             pub_id, sub_pub_id, gaid, idfa, ip_address, user_agent, source,p1,p2,p3,p4,p5, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?, NOW())
          `;

          db.query(
            insertSQL,
            [
              cid,
              publisher_id,
              campaign_id,
              advertiserClickId,
              pub_id || null,
              subpub || null,
              gaid || null,
              idfa || null,
              ip_address,
              user_agent,
              source || null,
              p1 || null,
              p2 || null,
              p3 || null,
              p4 || null,
              p5 || null
            ],
            (err3) => {
              if (err3) {
                console.error(err3);
                return res.status(500).send("Click tracking failed");
              }

              // 5️⃣ 🔥 Redirect with / without referrer
              if (hide_referrer === 1) {
                // Hide Google referrer
                return res
                  .status(200)
                  .set("Content-Type", "text/html")
                  .send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="refresh" content="0;url=${encodeURI(redirectURL)}">
  <title>Redirecting...</title>
</head>
<body>
  <script>
    window.location.replace("${encodeURI(redirectURL)}");
  </script>
</body>
</html>
                  `);
              }

              // Normal redirect (referrer allowed)
              return res.redirect(302, redirectURL);
            }
          );
        }
      );
    }
  );
};


// exports.trackClick = (req, res) => {
//   const { publisher_handle } = req.params;
//   const { cid, pub_id, subpub, gaid, idfa, source } = req.query;

//   if (!cid) {
//     return res.status(400).send("Missing click id");
//   }

//   const advertiserClickId = "ADV-" + crypto.randomBytes(6).toString("hex");

//   const ip_address =
//     req.headers["x-forwarded-for"]?.split(",")[0] ||
//     req.socket.remoteAddress;

//   const user_agent = req.get("User-Agent");

//   // 1️⃣ Find publisher link → campaign + publisher
//   db.query(
//     `SELECT campaign_id, publisher_id 
//      FROM publisher_links 
//      WHERE publisher_handle = ? 
//      LIMIT 1`,
//     [publisher_handle],

//     (err, pubRows) => {
//       if (err || pubRows.length === 0) {
//         console.log("ffd",err , pubRows)

//         return res.status(404).send("Invalid tracking link");
//       }
//       const { campaign_id, publisher_id } = pubRows[0];

//       // 2️⃣ Find advertiser link
//       db.query(
//         `SELECT advertiser_link, click_id_param 
//          FROM advertiser_links 
//          WHERE campaign_id = ? 
//          LIMIT 1`,
//         [campaign_id],
//         (err2, advRows) => {
//           if (err2 || advRows.length === 0) {
//             return res.status(404).send("No advertiser found");
//           }

//           const adv = advRows[0];

//           // 3️⃣ Build redirect URL
//           let redirectURL = adv.advertiser_link;

//           if (redirectURL.includes("{click_id}")) {
//             redirectURL = redirectURL.replace("{click_id}", advertiserClickId);
//           } else {
//             redirectURL +=
//               (redirectURL.includes("?") ? "&" : "?") +
//               `${adv.click_id_param}=${advertiserClickId}`;
//           }

//           // 4️⃣ Save click
//           const insertSQL = `
//             INSERT INTO clicks
//             (click_id, publisher_id, campaign_id, advertiser_click_id,
//              pub_id, sub_pub_id, gaid, idfa, ip_address, user_agent,source, created_at)
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, NOW())
//           `;

//           db.query(
//             insertSQL,
//             [
//               cid,
//               publisher_id,
//               campaign_id,
//               advertiserClickId,
//               pub_id || null,
//               subpub || null,
//               gaid || null,
//               idfa || null,
//               ip_address,
//               user_agent,
//               source || null
//             ],
//             (err3) => {
//               if (err3) {
//                 console.error(err3);
//                 return res.status(500).send("Click tracking failed");
//               }

//               // 5️⃣ Redirect
//               return res.redirect(302, redirectURL);
//             }
//           );
//         }
//       );
//     }
//   );
// };



// exports.trackClick = (req, res) => {
//   const { cid , pub, pub_id, subpub, gaid, idfa } = req.query;
//   const { internal_click_id } = req.params;

//   // INTERNAL CLICK ID (maps publisher link to campaign) stays same
//   // CLICK ID (unique per click)
//   const click_id = "SYS-" + crypto.randomBytes(6).toString("hex");
//   const advertiserClickId = crypto.randomBytes(10).toString("hex");

//   db.query(
//     "SELECT * FROM advertiser_links WHERE campaign_id = ? LIMIT 1",
//     [1],
//     (err, rows) => {
//       if (err || rows.length === 0)
//         return res.status(400).json({ error: "No advertiser link found" });

//       const adv = rows[0];
//       const redirectURL = adv.advertiser_link.replace("{{click_id}}", advertiserClickId);

//       const ip_address = req.ip || req.connection.remoteAddress;
//       const user_agent = req.get("User-Agent");

//       const sql = `
//         INSERT INTO clicks
//         (click_id, internal_click_id, publisher_id, campaign_id, pub_id, sub_pub_id, gaid, idfa, advertiser_click_id, ip_address, user_agent, created_at)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
//       `;

//       db.query(
//         sql,
//         [
//           cid,
//           internal_click_id,
//           pub,
//           adv.campaign_id,
//           pub_id || null,
//           subpub || null,
//           gaid || null,
//           idfa || null,
//           advertiserClickId,
//           ip_address,
//           user_agent
//         ],
//         (err2) => {
//           if (err2) return res.status(500).json({ error: err2 });

//           return res.redirect(redirectURL);
//         }
//       );
//     }
//   );
// };


exports.getCampaignWithPublisherLinks = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: "token is required" });
    }

    const query = `
      SELECT
        cd.id            AS offer_id,
        cd.campaign_name,
        cd.geo,
        cd.Vertical,
        cd.state_city,
        cd.preview_url,
        cd.os,
        cd.payable_event,
        cd.kpi,
        (cd.adv_payout * 0.7) AS payout,
        pl.generated_link AS tracking_link,
        pc.daily,
        pc.monthly,
        pc.lifetime,
        pc.type              AS cap_type,
        pc.publisher_cap_type
      FROM campaign_data cd

      INNER JOIN publisher_links pl
        ON cd.id = pl.campaign_id

      INNER JOIN (
        SELECT campaign_id, MAX(id) AS max_id
        FROM publisher_links
        WHERE api_token = ?
          AND status = 'approved'
        GROUP BY campaign_id
      ) latest ON pl.id = latest.max_id

      LEFT JOIN (
        SELECT campaign_id, daily, monthly, lifetime, type, publisher_cap_type
        FROM publisher_caps
        WHERE id IN (
          SELECT MAX(id) FROM publisher_caps GROUP BY campaign_id
        )
      ) pc ON cd.id = pc.campaign_id

      WHERE pl.api_token = ?
        AND pl.status = 'approved'
      ORDER BY pl.id DESC
    `;

    const [rows] = await db.promise().query(query, [token, token]);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No approved offers found for this token" });
    }

    const data = rows.map((row) => {
      let package_id = null;

      if (row.preview_url && row.preview_url !== "NA") {
        const url = row.preview_url;

        if (url.includes("apps.apple.com")) {
          const iosMatch = url.match(/\/id(\d+)/);
          if (iosMatch) package_id = iosMatch[1];
        } else if (url.includes("play.google.com")) {
          const androidMatch = url.match(/[?&]id=([^&]+)/);
          if (androidMatch) package_id = androidMatch[1];
        } else {
          package_id = url.trim();
        }
      }

      return { ...row, package_id };
    });

    return res.status(200).json({ success: true, count: data.length, data });

  } catch (error) {
    console.error("Error fetching campaign data:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
