const express = require("express");
const router = express.Router();
const controller = require("../controllers/clickController");

router.get("/click/:internal_click_id", controller.trackClick);

module.exports = router;