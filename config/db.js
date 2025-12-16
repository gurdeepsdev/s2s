const mysql = require("mysql2");
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "root",
  database: "s2s",
  port: 8889,
  // host: '160.153.172.237',
  // user: 'clickorbtits',
  // password: 'Clickorbits@123',
  // database: 'crmclickorbits',
  // port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,



});
module.exports = db;