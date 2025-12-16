const express = require("express");
const app = express();
const cors = require("cors");

app.use(cors());
app.use(express.json());

app.use("/campaign", require("./routes/campaignRoutes"));
app.use("/link", require("./routes/linkRoutes"));
app.use("/", require("./routes/clickRoutes"));
app.use("/postback", require("./routes/postbackRoutes"));
app.use("/publisher", require("./routes/publisherRoutes"));
// app.get("/click/test", (req, res) => {
//     res.redirect("https://advertiser.com");
//   });
app.listen(5800, () => console.log("Server running on port 5800"));