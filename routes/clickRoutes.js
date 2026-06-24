const express = require("express");
const router = express.Router();
const controller = require("../controllers/clickController");

router.get("/click/:publisher_handle", controller.trackClick);
router.get("/api/publisher/offers", controller.getCampaignWithPublisherLinks); 

module.exports = router;
