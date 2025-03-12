const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  const driver = getDriver(); // Now it's safe to use getDriver()
  const session = driver.session();
  try {
    // Query to fetch all nodes and relationships from the database
    const result = await session.run(
      "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25"
    );

    // Collect all unique nodes, relationships, and links
    const nodes = [];
    const links = [];

    result.records.forEach((record) => {
      const startNode = record.get("n").properties;
      const endNode = record.get("m").properties;
      const relationship = record.get("r");

      // Helper function to transform node properties
      const transformNode = (node) => ({
        id: node.id || node.NodeID || "", // Ensure NodeID is used if id is missing
        name: node.NodeID,
        labels: ["Node"], // Static label for nodes
        type: node.type || "",
        services: node.services
          ? node.services.split(";").map((s) => s.trim())
          : [],
        aum: node.aum || "",
        riskLevel: node.risk_level || "",
        location: node.location || "",
        notes: node.notes || "",
      });

      // Add start node to nodes array if not already added
      if (!nodes.some((n) => n.id === startNode.id)) {
        nodes.push(transformNode(startNode));
      }

      // Add end node to nodes array if not already added
      if (!nodes.some((n) => n.id === endNode.id)) {
        nodes.push(transformNode(endNode));
      }

      // Add the relationship to the links array
      links.push({
        source: startNode.id,
        target: endNode.id,
        relationship: relationship.type,
      });
    });

    // Send response with nodes and links
    res.json({
      success: true,
      nodes: Array.from(nodes.values()),
      links,
    });
  } catch (error) {
    console.error("Error fetching knowledge graph:", error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  } finally {
    // Close the session
    // await session.close();
  }
});

module.exports = router;
