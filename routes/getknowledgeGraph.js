const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();

  try {
    const state = req.query.state || null;
    const product = req.query.product || null;

    // const { state = null, product = null } = req.query;
    let nodes = new Map();
    let links = [];

    if (state && product) {
      let productQuery = `
        MATCH (n)-[r:HANDLES_PRODUCT]->(m:Product_Tags)
      `;
      let productParams = {};

      // Add WHERE clause only if product is not "All"
      if (product !== "All") {
        productQuery += ` WHERE m.NodeID = $productName`;
        productParams.productName = product;
      }

      productQuery += ` RETURN n, r, m LIMIT 100;`;

      const productResult = await session.run(productQuery, productParams);
      processResult(productResult, nodes, links);

      // Base query for state
      let stateQuery = `
        MATCH (n)-[r:HAS_STATE]->(m:State)
      `;
      let stateParams = {};

      // Add WHERE clause only if state is not "All"
      if (state !== "All") {
        stateQuery += ` WHERE m.NodeID = $stateName`;
        stateParams.stateName = state;
      }

      stateQuery += ` RETURN n, r, m LIMIT 100;`;

      const stateResult = await session.run(stateQuery, stateParams);
      processResult(stateResult, nodes, links);

      return res.json({
        success: true,
        nodes: Array.from(nodes.values()),
        links,
      });
    }

    console.log("Fetching all nodes");
    const generalQuery = `
      MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25;
    `;
    const generalResult = await session.run(generalQuery);
    processResult(generalResult, nodes, links);

    return res.json({
      success: true,
      nodes: Array.from(nodes.values()),
      links,
    });
  } catch (error) {
    console.error("Error fetching knowledge graph:", error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  } finally {
    await session.close();
  }
});

// ✅ Helper function to process query results
const processResult = (result, nodes, links) => {
  result.records.forEach((record) => {
    const startNode = record.get("n")?.properties || {};
    const endNode = record.get("m")?.properties || {};
    const relationship = record.get("r");

    // Transform node properties
    const transformNode = (node) => ({
      id: node.NodeID || "",
      name: node.NodeID || "",
      labels: ["Node"],
      type: node.type || "",
      services: node.services
        ? node.services.split(";").map((s) => s.trim())
        : [],
      aum: node.aum || "",
      riskLevel: node.risk_level || "",
      location: node.location || "",
      notes: node.notes || "",
    });

    // Store unique nodes
    if (startNode.NodeID && !nodes.has(startNode.NodeID)) {
      nodes.set(startNode.NodeID, transformNode(startNode));
    }
    if (endNode.NodeID && !nodes.has(endNode.NodeID)) {
      nodes.set(endNode.NodeID, transformNode(endNode));
    }

    // Store relationships
    if (relationship) {
      links.push({
        source: startNode.NodeID,
        target: endNode.NodeID,
        relationship: relationship.type,
      });
    }
  });
};

module.exports = router;
