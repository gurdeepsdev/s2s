const db = require("../config/db");

const crypto = require("crypto");

exports.trackClick = (req, res) => {
  const { cid , pub, pub_id, subpub, gaid, idfa } = req.query;
  const { internal_click_id } = req.params;

  // INTERNAL CLICK ID (maps publisher link to campaign) stays same
  // CLICK ID (unique per click)
  const click_id = "SYS-" + crypto.randomBytes(6).toString("hex");
  const advertiserClickId = crypto.randomBytes(10).toString("hex");

  db.query(
    "SELECT * FROM advertiser_links WHERE campaign_id = ? LIMIT 1",
    [1],
    (err, rows) => {
      if (err || rows.length === 0)
        return res.status(400).json({ error: "No advertiser link found" });

      const adv = rows[0];
      const redirectURL = adv.advertiser_link.replace("{{click_id}}", advertiserClickId);

      const ip_address = req.ip || req.connection.remoteAddress;
      const user_agent = req.get("User-Agent");

      const sql = `
        INSERT INTO clicks
        (click_id, internal_click_id, publisher_id, campaign_id, pub_id, sub_pub_id, gaid, idfa, advertiser_click_id, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      db.query(
        sql,
        [
          cid,
          internal_click_id,
          pub,
          adv.campaign_id,
          pub_id || null,
          subpub || null,
          gaid || null,
          idfa || null,
          advertiserClickId,
          ip_address,
          user_agent
        ],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2 });

          return res.redirect(redirectURL);
        }
      );
    }
  );
};
