const db = require("../config/db");

exports.getPublisherStats = (req, res) => {
  const { publisher_id } = req.params;

  const sql = `
    SELECT p.id, 
      SUM(w.amount) AS total_earnings, 
      COUNT(c.id) AS conversions 
    FROM publishers p
    LEFT JOIN wallet w ON w.publisher_id = p.id
    LEFT JOIN conversions c ON c.publisher_id = p.id
    WHERE p.id = ?
    GROUP BY p.id`;

  db.query(sql, [publisher_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err });
    res.json(rows[0]);
  });
};