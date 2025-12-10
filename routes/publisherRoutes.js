const express = require("express");
const router = express.Router();
const controller = require("../controllers/publisherController");

router.get("/stats/:publisher_id", controller.getPublisherStats);

module.exports = router;