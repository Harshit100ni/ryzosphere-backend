const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/get-product-tags", async (req, res) => {
  console.log("Fetching states...");
  try {
    const driver = getDriver();
    const session = driver.session();

    const query = `MATCH (n:Product_Tags) RETURN n.NodeID AS productName`; // Change NodeID if needed
    const result = await session.run(query);

    // Extract state names from the query result
    const productList = result.records.map((record) =>
      record.get("productName")
    );

    res.json({
      success: true,
      message: productList.length
        ? "fetched successfully."
        : "No states found.",
      data: productList,
    });

    await session.close();
  } catch (error) {
    console.error("Error fetching states:", error);
    res
      .status(500)
      .json({ status: "DOWN", message: "Database connection failed!" });
  }
});

module.exports = router;
