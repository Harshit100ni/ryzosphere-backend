const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/get-orgs-by-state-product", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();
  const { state, product } = req.query;

  if (!state || !product) {
    return res.status(400).json({
      success: false,
      message: "Both state and product are required.",
    });
  }

  try {
    const query = `
      MATCH (o:Organizations)-[:HAS_STATE]->(s:State)
      WHERE s.NodeID = $state

      WITH o, s  // Pass filtered organizations forward

      MATCH (o)-[:HANDLES_PRODUCT]->(p:Product_Tags)
      WHERE p.NodeID = $product

      WITH DISTINCT o, s, p  // Ensure uniqueness before joining organization type

      MATCH (o)-[:HAS_TYPE]->(t:Organization_Type)  // Get Organization Type

      RETURN DISTINCT 
        o.NodeID AS organizationID,
        o.company AS company,
        t.NodeID AS organizationType,  // No array, unique grouping
        s.NodeID AS state,
        p.NodeID AS product
      LIMIT 15;
    `;

    const result = await session.run(query, { state, product });

    // Process Data into Response Format
    const responseData = result.records.map((record) => ({
      organizationID: record.get("organizationID"),
      company: record.get("company"),
      organizationType: record.get("organizationType"), // Separate row for each type
      state: record.get("state") || "N/A",
      product: record.get("product") || "N/A",
    }));

    res.json({
      success: true,
      message: responseData.length
        ? "Matching organizations found."
        : "No matching organizations found.",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  } finally {
    await session.close(); // Ensure session closure
  }
});

module.exports = router;
