const mysql = require("mysql2");
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "root",
  database: "s2s",
  port: 8889,

});
module.exports = db;