const express = require("express");
const router = express.Router();
const controller = require("../controllers/linkController");

router.post("/advertiser", controller.saveAdvertiserLink);
router.post("/publisher", controller.generatePublisherLink);
router.post("/phandle", controller.handlePostback);



module.exports = router;