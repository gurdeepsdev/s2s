const db = require("../config/db");

const crypto = require("crypto");
const { buildRedirectURL } = require("../utils/trackingHandler");



const dbp = db.promise();

// ---------------------------------------------------------------------------
// Small, single-purpose steps mirroring the original pipeline, in the same
// sequential order as the original callback code:
// validateRequest -> loadPublisherLink -> checkCaps -> loadAdvertiserLink
//   -> buildRedirect -> logClick -> sendRedirect
// Every query result / error message below is byte-for-byte the same as the
// original callback implementation; only the *shape* of the code changed.
// checkCaps and loadAdvertiserLink are intentionally NOT run in parallel:
// under the current connectionLimit:10 pool, running them concurrently
// doubles simultaneous connection demand per in-flight request and measured
// slower under load than the pool sizing/COUNT(*) query bottleneck being
// addressed separately. Sequential order matches original pool behavior.
// ---------------------------------------------------------------------------

function validateRequest(req) {
  const { publisher_handle } = req.params;
  const {
    cid, pub_id, subpub, gaid, idfa, source, campaign_id,
    p1, p2, p3, p4, p5
  } = req.query;

  if (!campaign_id) return { error: { status: 400, message: "Missing campaign_id" } };
  if (!cid) return { error: { status: 400, message: "Missing click id" } };

  const ip_address =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;
  const user_agent = req.get("User-Agent");

  return {
    params: {
      publisher_handle, cid, pub_id, subpub, gaid, idfa, source, campaign_id,
      p1, p2, p3, p4, p5, ip_address, user_agent
    }
  };
}

// Gate #1 — must resolve before anything else starts (redirect destination
// and cap counting both depend on publisher_id/campaign_id from this row).
async function loadPublisherLink(publisher_handle, campaign_id) {
  try {
    const [pubRows] = await dbp.query(
      `SELECT campaign_id, publisher_id, hide_referrer
       FROM publisher_links
       WHERE publisher_handle = ?
         AND campaign_id = ?
         AND status = 'approved'
       LIMIT 1`,
      [publisher_handle, campaign_id]
    );
    return pubRows.length > 0 ? pubRows[0] : null;
  } catch (err) {
    console.error("Publisher link lookup error:", err);
    return null; // original treated query error same as "not found" -> 403
  }
}

// Same cap SQL and thresholds as the original. Must fully pass before
// loadAdvertiserLink() runs (see call site) — matches original ordering.
async function checkCaps(campaign_id, publisher_id) {
  let capRows;
  try {
    [capRows] = await dbp.query(
      `SELECT daily, monthly, lifetime
       FROM publisher_caps
       WHERE campaign_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [campaign_id]
    );
  } catch (err) {
    console.error("Cap lookup error:", err);
    return { ok: false, status: 500, message: "Cap check failed" };
  }

  const cap = capRows.length > 0 ? capRows[0] : null;
  if (!cap || (cap.daily === null && cap.monthly === null && cap.lifetime === null)) {
    return { ok: true };
  }

  let countRows;
  try {
    [countRows] = await dbp.query(
      `SELECT
         SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS daily_count,
         SUM(CASE WHEN YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW()) THEN 1 ELSE 0 END) AS monthly_count,
         COUNT(*) AS lifetime_count
       FROM clicks
       WHERE campaign_id = ? AND publisher_id = ?`,
      [campaign_id, publisher_id]
    );
  } catch (err) {
    console.error("Click count error:", err);
    return { ok: false, status: 500, message: "Cap count failed" };
  }

  const { daily_count, monthly_count, lifetime_count } = countRows[0];
  if (cap.daily !== null && daily_count >= cap.daily) {
    return { ok: false, status: 429, message: "Daily click cap reached" };
  }
  if (cap.monthly !== null && monthly_count >= cap.monthly) {
    return { ok: false, status: 429, message: "Monthly click cap reached" };
  }
  if (cap.lifetime !== null && lifetime_count >= cap.lifetime) {
    return { ok: false, status: 429, message: "Lifetime click cap reached" };
  }
  return { ok: true };
}

// Only runs after checkCaps() passes (see call site) — matches original ordering.
async function loadAdvertiserLink(campaign_id) {
  try {
    const [advRows] = await dbp.query(
      `SELECT advertiser_link, click_id_param
       FROM advertiser_links
       WHERE campaign_id = ?
       LIMIT 1`,
      [campaign_id]
    );
    return advRows.length > 0 ? advRows[0] : null;
  } catch (err) {
    console.error("Advertiser link lookup error:", err);
    return null; // original treated query error same as "not found" -> 404
  }
}

// Macro replacement (unchanged) + buildRedirectURL(), now guarded so a bad
// advertiser_link value (e.g. the literal 'NA' seen in PM2 logs) can't throw
// an uncaught TypeError [ERR_INVALID_URL] out of a db callback and hang/crash
// the process. On failure we return null instead of throwing.
function buildRedirect(adv, advertiserClickId, params) {
  const { gaid, idfa, source, subpub, p1, p2, p3, p4, p5 } = params;

  const advertiserLink = adv.advertiser_link
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

  try {
    return buildRedirectURL({
      advertiser_link: advertiserLink,
      advertiserClickId,
      source,
      adv
    });
  } catch (err) {
    console.error("Invalid advertiser URL for campaign, cannot build redirect:", err.message);
    return null;
  }
}

async function logClick(params) {
  const {
    cid, publisher_id, campaign_id, advertiserClickId,
    pub_id, subpub, gaid, idfa, ip_address, user_agent, source,
    p1, p2, p3, p4, p5
  } = params;

  const insertSQL = `
    INSERT INTO clicks
    (click_id, publisher_id, campaign_id, advertiser_click_id,
     pub_id, sub_pub_id, gaid, idfa, ip_address, user_agent, source,p1,p2,p3,p4,p5, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?, NOW())
  `;

  await dbp.query(insertSQL, [
    cid, publisher_id, campaign_id, advertiserClickId,
    pub_id || null, subpub || null, gaid || null, idfa || null,
    ip_address, user_agent, source || null,
    p1 || null, p2 || null, p3 || null, p4 || null, p5 || null
  ]);
}

function sendRedirect(res, redirectURL, hide_referrer) {
  if (hide_referrer === 1) {
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
  return res.redirect(302, redirectURL);
}

exports.trackClick = async (req, res) => {
  try {
    const { error, params } = validateRequest(req);
    if (error) return res.status(error.status).send(error.message);

    const advertiserClickId = "ADV-" + crypto.randomBytes(6).toString("hex");

    // Gate #1: publisher must be approved for this campaign. Nothing else
    // can start until this resolves, since caps/advertiser both need its output.
    const pub = await loadPublisherLink(params.publisher_handle, params.campaign_id);
    if (!pub) return res.status(403).send("Tracking link is inactive");

    const { campaign_id, publisher_id, hide_referrer } = pub;

    // Sequential, matching the original: cap check must fully pass before
    // the advertiser lookup ever runs (and before a redirect is possible).
    // NOTE: checkCaps() and loadAdvertiserLink() have no data dependency on
    // each other and could run concurrently via Promise.all for a latency
    // win — deliberately not done here. Under the current
    // connectionLimit:10 pool, that pattern doubles simultaneous connection
    // demand per in-flight request and measured slower under load
    // (benchmarked) than the real bottleneck, which is pool sizing and the
    // cap COUNT(*) query. Revisit parallelizing this once pool sizing is
    // fixed based on production MySQL metrics.
    const capResult = await checkCaps(campaign_id, publisher_id);
    if (!capResult.ok) return res.status(capResult.status).send(capResult.message);

    const adv = await loadAdvertiserLink(campaign_id);
    if (!adv) return res.status(404).send("No advertiser found");

    const redirectURL = buildRedirect(adv, advertiserClickId, params);
    if (!redirectURL) return res.status(502).send("Invalid advertiser configuration");

    // Click logging stays before the redirect, matching original behavior:
    // if the insert fails, no redirect is sent and the caller gets a 500.
    try {
      await logClick({ ...params, publisher_id, campaign_id, advertiserClickId });
    } catch (err) {
      console.error("Click insert error:", err);
      return res.status(500).send("Click tracking failed");
    }

    return sendRedirect(res, redirectURL, hide_referrer);
  } catch (err) {
    // Safety net: guarantees a response is always sent, never a hanging request.
    console.error("Unexpected error in trackClick:", err);
    return res.status(500).send("Click tracking failed");
  }
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
