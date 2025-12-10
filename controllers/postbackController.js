const db = require("../config/db");

exports.handlePostback = (req, res) => {
  const { clickid, conversion_id, payout } = req.query;

  db.query(
    "SELECT * FROM clicks WHERE advertiser_click_id = ?",
    [clickid],
    (err, rows) => {
      if (err || rows.length === 0)
        return res.status(400).json({ error: "Click not found" });

      const click = rows[0];

      db.query(
        `INSERT INTO conversions (campaign_id, click_id, advertiser_click_id, conversion_id, payout, publisher_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          click.campaign_id,
          click.click_id,
          click.advertiser_click_id,
          conversion_id,
          payout,
          click.publisher_id,
        ]
      );

      db.query(
        "INSERT INTO wallet (publisher_id, conversion_id, amount) VALUES (?, LAST_INSERT_ID(), ?)",
        [click.publisher_id, payout]
      );

      res.json({ message: "Conversion saved" });
    }
  );
};