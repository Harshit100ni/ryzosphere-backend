require("dotenv").config();
const OpenAI = require("openai");

const express = require("express");
const cors = require("cors");
const routes = require("./routes/versioning");
const { initNeo4j, getDriver } = require("./neo4jConnection");

const app = express();
const PORT = process.env.SERVER_PORT || 8080;

app.use(cors());
app.use(express.json());
(async () => {
  try {
    await initNeo4j();
    console.log("Neo4j initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Neo4j:", error);
    process.exit(1);
  }
})();
const driver = getDriver();
const session = driver.session();
app.use("/api", routes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
