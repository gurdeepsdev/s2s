const db = require("../config/db");
const crypto = require("crypto");

/**
 * POST /impression/:publisher_handle
 *
 * Fires when an ad is viewed (before any click).
 * Collects the same metadata as the click pipeline and stores it
 * in the `impressions` table. Returns a 1×1 transparent GIF so
 * it can be embedded as an <img> pixel in ad creatives.
 */
exports.trackImpression = (req, res) => {
  const { publisher_handle } = req.params;

  // Accept params from query-string (GET pixel) or request body (POST S2S)
  // req.body may be undefined on GET requests — use optional chaining ?.
  const body = req.body || {};
  const source      = req.query.source      || body.source      || null;
  const pub_id      = req.query.pub_id      || body.pub_id      || null;
  const subpub      = req.query.sub_pub     || body.sub_pub     || null;
  const gaid        = req.query.gaid        || body.gaid        || null;
  const idfa        = req.query.idfa        || body.idfa        || null;
  const campaign_id = req.query.campaign_id || body.campaign_id || null;

  // imp_id mirrors cid in clicks — publisher supplies it or we generate one
  const imp_id =
    req.query.imp_id ||
    body.imp_id      ||
    "IMP-" + crypto.randomBytes(6).toString("hex");

  if (!campaign_id) {
    // Still send a pixel so the ad creative doesn't break
    return sendPixel(res);
  }

  const ip_address =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  const user_agent = req.get("User-Agent");

  // 1️⃣ Resolve publisher_handle → campaign + publisher (same query as click)
  db.query(
    `SELECT campaign_id, publisher_id, hide_referrer
     FROM publisher_links
     WHERE publisher_handle = ?
       AND campaign_id = ?
     LIMIT 1`,
    [publisher_handle, campaign_id],
    (err, pubRows) => {
      if (err || pubRows.length === 0) {
        console.error("❌ Impression – publisher link not found:", publisher_handle, campaign_id);
        return sendPixel(res); // still return pixel; don't expose errors to creative
      }

      const { campaign_id: resolved_campaign_id, publisher_id } = pubRows[0];

      // 2️⃣ Insert impression (same fields as clicks table)
      const insertSQL = `
        INSERT INTO impressions
        (imp_id, publisher_id, campaign_id,
         pub_id, sub_pub_id, gaid, idfa,
         ip_address, user_agent, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      db.query(
        insertSQL,
        [
          imp_id,
          publisher_id,
          resolved_campaign_id,
          pub_id   || null,
          subpub   || null,
          gaid     || null,
          idfa     || null,
          ip_address,
          user_agent,
          source   || null
        ],
        (err2) => {
          if (err2) {
            console.error("❌ Impression insert failed:", err2);
          } else {
            console.log("✅ Impression tracked:", imp_id, "| campaign:", resolved_campaign_id, "| publisher:", publisher_id);
          }

          // Always return the pixel — impression tracking must be non-blocking
          return sendPixel(res);
        }
      );
    }
  );
};

/**
 * Sends a 1×1 transparent GIF — the standard response for impression pixels.
 * The creative embeds this as <img src="...impression_url..."> and the browser
 * fires the request automatically when the ad is rendered.
 */
function sendPixel(res) {
  // Minimal 1×1 transparent GIF (43 bytes)
  const PIXEL = Buffer.from(
    "47494638396101000100800000ffffff00000021f90400000000002c00000000" +
    "010001000002024401003b",
    "hex"
  );

  res
    .status(200)
    .set({
      "Content-Type":  "image/gif",
      "Content-Length": PIXEL.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma:          "no-cache",
      Expires:         "0"
    })
    .end(PIXEL);
}
