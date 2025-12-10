const db = require("../config/db");
exports.createCampaign = (req, res) => {
  const { advertiser_id, campaign_name, payout } = req.body;
  db.query(
    "INSERT INTO campaigns (advertiser_id, campaign_name, payout) VALUES (?, ?, ?)",
    [advertiser_id, campaign_name, payout],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: "Campaign created", id: result.insertId });
    }
  );
};
exports.getCampaigns = (req, res) => {
  db.query("SELECT * FROM campaigns", (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows);
  });
};