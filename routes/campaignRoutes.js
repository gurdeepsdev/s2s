const express = require("express");
const router = express.Router();
const controller = require("../controllers/campaignController");

router.post("/create", controller.createCampaign);
router.get("/all", controller.getCampaigns);

module.exports = router;