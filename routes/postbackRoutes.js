const express = require("express");
const router = express.Router();
const controller = require("../controllers/postbackController");

router.get("/", controller.handlePostback);
router.put('/place-link', controller.updatePlaceLink);


module.exports = router;