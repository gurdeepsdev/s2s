const express = require("express");
const router = express.Router();
const controller = require("../controllers/linkController");

router.post("/advertiser", controller.saveAdvertiserLink);
router.post("/publisher", controller.generatePublisherLink);
router.post("/phandle", controller.handlePostback);
router.post("/publisher/disapprove", controller.disapprovePublisher); 
router.get("/publisher", controller.getPublisherLinks);
router.get("/publisher-api-url", controller.getPublisherApiUrl);



module.exports = router;
