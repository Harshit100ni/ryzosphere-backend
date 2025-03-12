const express = require("express");
const router = express.Router();
const { getDriver } = require("../../neo4jConnection");

router.post("/init", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();

  try {
    // await session.run(`MATCH (n) DETACH DELETE n`);

    const { nodesUrl, relationshipsUrl } = req.body;
    if (!nodesUrl || !relationshipsUrl) {
      return res
        .status(400)
        .json({ error: "Both nodesUrl and relationshipsUrl are required" });
    }

    // await session.writeTransaction(async (tx) => {
    //   await tx.run(`MATCH (n) DETACH DELETE n`);
    // });

    await loadCSVIntoNeo4j({ nodesUrl, relationshipsUrl });

    res.json({
      message: "Data successfully inserted into Neo4j using LOAD CSV!",
    });
  } catch (error) {
    console.error("Error in /init API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
