const db = require("../config/db");

exports.createCap = (req, res) => {
  const { campaign_id, adv_id, publisher_ids, type, publisher_cap_type, daily, monthly, lifetime } = req.body;

  if (!campaign_id || !adv_id) {
    return res.status(400).json({ success: false, message: "campaign_id and adv_id are required" });
  }

  db.query(
    `INSERT INTO publisher_caps
     (campaign_id, adv_id, publisher_ids, type, publisher_cap_type, daily, monthly, lifetime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      campaign_id,
      adv_id,
      publisher_ids ? JSON.stringify(publisher_ids) : null,
      type          || null,
      publisher_cap_type || null,
      daily         ?? null,
      monthly       ?? null,
      lifetime      ?? null
    ],
    (err, result) => {
      if (err) {
        console.error("❌ createCap error:", err);
        return res.status(500).json({ success: false, error: err });
      }

      return res.json({ success: true, message: "Cap created successfully", id: result.insertId });
    }
  );
};

exports.getCaps = (req, res) => {
  const { campaign_id } = req.query;

  if (!campaign_id) {
    return res.status(400).json({ success: false, message: "campaign_id is required" });
  }

  db.query(
    `SELECT * FROM publisher_caps WHERE campaign_id = ? ORDER BY id DESC`,
    [campaign_id],
    (err, rows) => {
      if (err) {
        console.error("❌ getCaps error:", err);
        return res.status(500).json({ success: false, error: err });
      }

      const data = rows.map((row) => {
        let publisher_ids = null;
        if (row.publisher_ids) {
          try {
            publisher_ids = JSON.parse(row.publisher_ids);
          } catch {
            publisher_ids = String(row.publisher_ids).split(",").map((s) => s.trim());
          }
        }
        return { ...row, publisher_ids };
      });

      return res.json({ success: true, data });
    }
  );
};