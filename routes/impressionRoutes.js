const express = require("express");
const router  = express.Router();
const controller = require("../controllers/impressionController");

// Impression pixel endpoint
// GET  /impression/:publisher_handle?campaign_id=...&imp_id=...&pub_id=...&gaid=...&source=...
// POST /impression/:publisher_handle  (same params in body)
router.get( "/impression/:publisher_handle", controller.trackImpression);
router.post("/impression/:publisher_handle", controller.trackImpression);

module.exports = router;
