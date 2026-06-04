const express = require("express");
const router = express.Router();

const controller = require("../controllers/eventsController");

// Events
router.post("/events", controller.addEvent);
router.get("/events/:campaign_id", controller.getEventsByCampaign);

// Pass Postback
router.post("/pass-postback", controller.upsertPassPostback);
router.get("/pass-postback/:campaign_id", controller.getPassPostbackByCampaign);

// Sampling
router.post("/sampling", controller.upsertSampling);
router.get("/sampling/:campaign_id", controller.getSamplingByCampaign);

module.exports = router;
