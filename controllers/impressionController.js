const db     = require("../config/db");
const crypto = require("crypto");
const axios  = require("axios");
const { buildRedirectURL } = require("../utils/trackingHandler");

/**
 * GET|POST /impression/:publisher_handle
 *
 * Full mirror of the click tracking flow:
 *   1. Resolve publisher_handle → campaign + publisher
 *   2. Load advertiser_impression_url from advertiser_links
 *   3. Generate advertiser impression ID (ADV-IMP-xxxx)
 *   4. Replace all macros in the advertiser impression URL
 *   5. Store impression row (same fields as clicks)
 *   6. Fire the advertiser impression URL (async, non-blocking)
 *   7. Return 1×1 transparent GIF to the publisher pixel
 */
exports.trackImpression = (req, res) => {
  const { publisher_handle } = req.params;

  // ── Accept params from query-string (GET pixel) or body (POST S2S) ──────
  // req.body may be undefined on GET requests — always fallback to {}
  const body        = req.body || {};
  const campaign_id = req.query.campaign_id || body.campaign_id || null;
  const pub_id      = req.query.pub_id      || body.pub_id      || null;
  const subpub      = req.query.sub_pub     || body.sub_pub     || null;
  const gaid        = req.query.gaid        || body.gaid        || null;
  const idfa        = req.query.idfa        || body.idfa        || null;
  const source      = req.query.source      || body.source      || null;

  // imp_id: publisher-supplied or auto-generated (mirrors cid in clicks)
  const imp_id =
    req.query.imp_id ||
    body.imp_id      ||
    "IMP-" + crypto.randomBytes(6).toString("hex");

  // advertiser impression ID: our own generated ID (mirrors advertiserClickId)
  const advertiserImpId = "ADV-IMP-" + crypto.randomBytes(6).toString("hex");

  if (!campaign_id) {
    console.warn("⚠️  Impression hit with no campaign_id — returning pixel");
    return sendPixel(res);
  }

  const ip_address =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  const user_agent = req.get("User-Agent");

  // ── Step 1: Resolve publisher_handle → campaign + publisher ─────────────
  db.query(
    `SELECT campaign_id, publisher_id, hide_referrer
     FROM publisher_links
     WHERE publisher_handle = ?
       AND campaign_id      = ?
     LIMIT 1`,
    [publisher_handle, campaign_id],
    (err, pubRows) => {
      if (err || pubRows.length === 0) {
        console.error("❌ Impression – publisher link not found:", publisher_handle, campaign_id);
        return sendPixel(res);
      }

      const { campaign_id: resolved_campaign_id, publisher_id } = pubRows[0];

      // ── Step 2: Load advertiser impression URL ───────────────────────────
      db.query(
        `SELECT advertiser_impression_url, click_id_param
         FROM advertiser_links
         WHERE campaign_id = ?
         LIMIT 1`,
        [resolved_campaign_id],
        (err2, advRows) => {
          if (err2) {
            console.error("❌ Advertiser link lookup failed:", err2);
          }

          const adv = (advRows && advRows.length > 0) ? advRows[0] : {};
          const advertiserImpressionUrl = adv.advertiser_impression_url || null;

          // ── Step 3: Build the forwarding URL (same macro logic as clicks) ─
          let forwardUrl = null;

          if (advertiserImpressionUrl) {
            // Replace all standard macros — same set as click controller
            let cleaned = advertiserImpressionUrl
              .replace(/{imp_id}/g,       advertiserImpId)
              .replace(/{click_id}/g,     advertiserImpId)  // some networks reuse {click_id}
              .replace(/{gaid}/g,         gaid    || "")
              .replace(/{idfa}/g,         idfa    || "")
              .replace(/{source}/g,       source  || "")
              .replace(/{sub_pub}/g,      subpub  || "")
              .replace(/{android_id}/g,   gaid    || "")
              .replace(/{publisher_id}/g, publisher_id || "")
              .replace(/{af_ad_id}/g,     "")
              .replace(/{p4}/g,           "");

            // Run through the same buildRedirectURL handler used for clicks
            // (handles AppsFlyer, PlayStore, Branch, generic web)
            forwardUrl = buildRedirectURL({
              advertiser_link:   cleaned,
              advertiserClickId: advertiserImpId,
              source,
              adv
            });

            console.log("🔗 Advertiser impression URL built:", forwardUrl);
          }

          // ── Step 4: Store impression (same schema as clicks) ─────────────
          const insertSQL = `
            INSERT INTO impressions
            (imp_id, advertiser_imp_id, publisher_id, campaign_id,
             pub_id, sub_pub_id, gaid, idfa,
             ip_address, user_agent, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          db.query(
            insertSQL,
            [
              imp_id,
              advertiserImpId,
              publisher_id,
              resolved_campaign_id,
              pub_id  || null,
              subpub  || null,
              gaid    || null,
              idfa    || null,
              ip_address,
              user_agent,
              source  || null
            ],
            (err3) => {
              if (err3) {
                console.error("❌ Impression insert failed:", err3);
              } else {
                console.log(
                  "✅ Impression stored:", imp_id,
                  "| adv_imp_id:", advertiserImpId,
                  "| campaign:", resolved_campaign_id,
                  "| publisher:", publisher_id
                );
              }

              // ── Step 5: Fire advertiser impression URL (async, non-blocking)
              if (forwardUrl) {
                fireAdvertiserImpression(forwardUrl);
              }

              // ── Step 6: Always return the pixel ─────────────────────────
              return sendPixel(res);
            }
          );
        }
      );
    }
  );
};

// ─────────────────────────────────────────────────────────────
// Fire the advertiser impression URL in the background.
// Non-blocking — never delays or breaks the pixel response.
// Mirrors firePublisherPostback() in postbackController.
// ─────────────────────────────────────────────────────────────
async function fireAdvertiserImpression(url) {
  try {
    await axios.get(url, { timeout: 5000 });
    console.log("✅ Advertiser impression fired:", url);
  } catch (e) {
    console.error("❌ Advertiser impression fire failed:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Returns a 1×1 transparent GIF.
// Standard pixel response — never blocked by errors upstream.
// ─────────────────────────────────────────────────────────────
function sendPixel(res) {
  const PIXEL = Buffer.from(
    "47494638396101000100800000ffffff00000021f90400000000002c00000000" +
    "010001000002024401003b",
    "hex"
  );

  res
    .status(200)
    .set({
      "Content-Type":   "image/gif",
      "Content-Length": PIXEL.length,
      "Cache-Control":  "no-store, no-cache, must-revalidate, private",
      Pragma:           "no-cache",
      Expires:          "0"
    })
    .end(PIXEL);
}
