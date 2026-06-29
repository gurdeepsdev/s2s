const express = require("express");
const router = express.Router();
const controller = require("../controllers/capController");

router.post("/create-cap", controller.createCap);
router.get("/get-caps", controller.getCaps);

module.exports = router;
