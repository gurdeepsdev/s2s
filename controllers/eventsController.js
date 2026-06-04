const db = require("../config/db");

// ➕ Add Event(s) - Supports Array Input
exports.addEvent = async (req, res) => {
    try {
      const { campaign_id, event_name, event_value, event_payout, adv_id } = req.body;
  
      if (!campaign_id || !event_name) {
        return res.status(400).json({ success: false, message: "campaign_id and event_name are required" });
      }
  
      // Normalize to arrays
      const names   = Array.isArray(event_name) ? event_name : [event_name];
      const values  = Array.isArray(event_value) ? event_value : [event_value];
      const payouts = Array.isArray(event_payout) ? event_payout : [event_payout];
  
      // Optional safety check
      if (names.length !== values.length || names.length !== payouts.length) {
        return res.status(400).json({ success: false, message: "Array length mismatch" });
      }
  
      const eventRows = names.map((name, i) => ([
        campaign_id,
        name,
        values[i] ?? null,
        payouts[i] ?? 0,
        adv_id ?? null
      ]));
  
      // 1️⃣ Insert into events
      await db.promise().query(
        `INSERT INTO events (campaign_id, event_name, event_value, event_payout, adv_id)
         VALUES ?`,
        [eventRows]
      );
  
      // 2️⃣ Insert into pass_post_back (default is_pass = 1)
      const passRows = names.map((name) => ([
        campaign_id,
        name,
        1,            // default allow passback
      ]));
  
      await db.promise().query(
        `INSERT INTO pass_post_back (campaign_id, event_name, is_pass)
         VALUES ?
         ON DUPLICATE KEY UPDATE 
           is_pass = VALUES(is_pass)
          `,
        [passRows]
      );
 // 3 Insert into pass_post_back (default is_pass = 1)
         const passRows1 = names.map((name) => ([
            campaign_id,
            name,
            0,            // default allow passback
          ]));
      
      await db.promise().query(
        `INSERT INTO sampling (campaign_id, event_name, sampling_percentage)
         VALUES ?
         ON DUPLICATE KEY UPDATE 
           sampling_percentage = VALUES(sampling_percentage)
          `,
        [passRows1]
      );
  
      res.json({
        success: true,
        message: "Events added successfully & pass_post_back initialized",
        inserted: names.length
      });
  
    } catch (err) {
      console.error("❌ Add Event Error:", err);
      res.status(500).json({ success: false, message: "Failed to add events" });
    }
  };
  


  

  // 📥 Get Events by Campaign
exports.getEventsByCampaign = async (req, res) => {
    try {
      const { campaign_id  } = req.params;
  
      if (!campaign_id) {
        return res.status(400).json({ success: false, message: "campaign_id is required" });
      }
  
      const [rows] = await db.promise().query(
        ` SELECT 
        e.*,
        COALESCE(s.sampling_percentage, 100) AS sampling_percentage
      FROM events e
      LEFT JOIN sampling s
        ON s.campaign_id = e.campaign_id
       AND s.event_name = e.event_name
      WHERE e.campaign_id = ?
      ORDER BY e.id DESC`,
        [campaign_id]
      );
  
      res.json({ success: true, data: rows });
  
    } catch (err) {
      console.error("❌ Get Events Error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch events" });
    }
  };

  // ➕ Add or Update Pass Postback Rule
// ➕ Add or Update Pass Postback Rule (supports update by id
// ➕ Add or Update Pass Postback Rule (supports update by id)
exports.upsertPassPostback = async (req, res) => {
    try {
      const { id, is_pass } = req.body;
  
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "id is required to update pass_post_back"
        });
      }
  
      if (typeof is_pass === "undefined") {
        return res.status(400).json({
          success: false,
          message: "is_pass is required"
        });
      }
  
      const [result] = await db.promise().query(
        `UPDATE pass_post_back
         SET is_pass = ?
         WHERE id = ?`,
        [is_pass ? 1 : 0, id]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Record not found"
        });
      }
  
      return res.json({
        success: true,
        message: "Pass postback rule updated successfully"
      });
  
    } catch (err) {
      console.error("❌ Pass Postback Update Error:", err);
      res.status(500).json({ success: false, message: "Failed to update pass postback rule" });
    }
  };




// 📥 Get Pass Postback Rules by Campaign
exports.getPassPostbackByCampaign = async (req, res) => {
    try {
      const { campaign_id } = req.params;
  
      const [rows] = await db.promise().query(
        `SELECT * FROM pass_post_back WHERE campaign_id = ?`,
        [campaign_id]
      );
  
      res.json({ success: true, data: rows });
  
    } catch (err) {
      console.error("❌ Get Pass Postback Error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch pass rules" });
    }
  };

  // ➕ Add or Update Sampling
// ➕ Add or Update Sampling (Supports Array Input)    
// ✏️ Update Sampling Percentage (by id only)
exports.upsertSampling = async (req, res) => {
  try {
    const { id, sampling_percentage } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required"
      });
    }

    if (typeof sampling_percentage === "undefined") {
      return res.status(400).json({
        success: false,
        message: "sampling_percentage is required"
      });
    }

    if (sampling_percentage < 0 || sampling_percentage > 100) {
      return res.status(400).json({
        success: false,
        message: "sampling_percentage must be between 0-100"
      });
    }

    const [result] = await db.promise().query(
      `UPDATE sampling
       SET sampling_percentage = ?
       WHERE id = ?`,
      [sampling_percentage, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Sampling record not found"
      });
    }

    return res.json({
      success: true,
      message: "Sampling percentage updated successfully"
    });

  } catch (err) {
    console.error("❌ Update Sampling Error:", err);
    res.status(500).json({ success: false, message: "Failed to update sampling percentage" });
  }
};

  
// 📥 Get Sampling Rules by Campaign
exports.getSamplingByCampaign = async (req, res) => {
    try {
      const { campaign_id } = req.params;
  
      const [rows] = await db.promise().query(
        `SELECT * FROM sampling WHERE campaign_id = ?`,
        [campaign_id]
      );
  
      res.json({ success: true, data: rows });
  
    } catch (err) {
      console.error("❌ Get Sampling Error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch sampling rules" });
    }
  };
    
