const neo4j = require("neo4j-driver");
require("dotenv").config();

const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USER;
const PASSWORD = process.env.NEO4J_PASSWORD;

console.log(URI);
console.log(USER);
console.log(PASSWORD);

let driver;

async function initNeo4j() {
  try {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
    const serverInfo = await driver.getServerInfo();
    console.log("Neo4j Connection Established:", serverInfo);
  } catch (err) {
    console.error(`Neo4j Connection Error: ${err.message}`);
    throw err;
  }
}

function getDriver() {
  if (!driver) {
    throw new Error("Neo4j driver not initialized. Call initNeo4j() first.");
  }
  return driver;
}

module.exports = { getDriver, initNeo4j };
