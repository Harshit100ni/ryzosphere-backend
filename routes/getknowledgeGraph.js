// const express = require("express");
// const { getDriver } = require("../neo4jConnection");

// const router = express.Router();

// router.get("/", async (req, res) => {
//   const driver = getDriver();
//   const session = driver.session();

//   try {
//     const state = req.query.state || null;
//     const product = req.query.product || null;
//     const type = req.query.type || null;
//     const subType = req.query.subType || "All";

//     let nodes = new Map();
//     let links = [];

//     if (state && product && type) {
//       let productQuery = `
//         MATCH (n)-[r:HANDLES_PRODUCT]->(m:Product_Tags)
//       `;
//       let productParams = {};

//       // Add WHERE clause only if product is not "All"
//       if (product !== "All") {
//         productQuery += ` WHERE m.NodeID = $productName`;
//         productParams.productName = product;
//       }

//       productQuery += ` RETURN n, r, m LIMIT 100;`;

//       const productResult = await session.run(productQuery, productParams);
//       processResult(productResult, nodes, links);

//       // Base query for state
//       let stateQuery = `
//         MATCH (n)-[r:HAS_STATE]->(m:State)
//       `;
//       let stateParams = {};

//       // Add WHERE clause only if state is not "All"
//       if (state !== "All") {
//         stateQuery += ` WHERE m.NodeID = $stateName`;
//         stateParams.stateName = state;
//       }

//       stateQuery += ` RETURN n, r, m LIMIT 100;`;

//       const stateResult = await session.run(stateQuery, stateParams);
//       processResult(stateResult, nodes, links);

//       // Base query for state

//       //  Type Query ------------------------------------

//       let typeQuery = `
//         MATCH (n)-[r:HAS_TYPE]->(m:Organization_Type)
//       `;
//       let typeParams = {};

//       // Add WHERE clause only if state is not "All"
//       if (type !== "All") {
//         typeQuery += ` WHERE m.NodeID = $type`;
//         typeParams.type = type;
//       }

//       typeQuery += ` RETURN n, r, m LIMIT 100;`;

//       const typeResult = await session.run(typeQuery, typeParams);
//       processResult(typeResult, nodes, links);

//       // Sub Type based Query

//       let subTypeQuery = `MATCH (n)-[r:HAS_SUBTYPE]->(m:Organization_Sub_Type)`;
//       let subTypeParams = {};

//       if (subType !== "All") {
//         subTypeQuery += ` WHERE m.NodeID = $subTypeName`;
//         subTypeParams.subTypeName = subType;
//       }
//       subTypeQuery += ` RETURN n, r, m LIMIT 100;`;
//       const subTyperesult = await session.run(subTypeQuery, subTypeParams);
//       processResult(subTyperesult, nodes, links);

//       return res.json({
//         success: true,
//         nodes: Array.from(nodes.values()),
//         links,
//       });
//     }

//     console.log("Fetching all nodes");
//     const generalQuery = `
//       MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25;
//     `;
//     const generalResult = await session.run(generalQuery);
//     processResult(generalResult, nodes, links);

//     return res.json({
//       success: true,
//       nodes: Array.from(nodes.values()),
//       links,
//     });
//   } catch (error) {
//     console.error("Error fetching knowledge graph:", error);
//     res.status(500).json({ success: false, message: "Error fetching data" });
//   } finally {
//     await session.close();
//   }
// });

// // ✅ Helper function to process query results
// const processResult = (result, nodes, links) => {
//   result.records.forEach((record) => {
//     const startNode = record.get("n")?.properties || {};
//     const endNode = record.get("m")?.properties || {};
//     const relationship = record.get("r");

//     // Transform node properties
//     const transformNode = (node) => ({
//       id: node.NodeID || "",
//       name: node.NodeID || "",
//       labels: ["Node"],
//       type: node.type || "",
//       services: node.services
//         ? node.services.split(";").map((s) => s.trim())
//         : [],
//       aum: node.aum || "",
//       riskLevel: node.risk_level || "",
//       location: node.location || "",
//       notes: node.notes || "",
//     });

//     // Store unique nodes
//     if (startNode.NodeID && !nodes.has(startNode.NodeID)) {
//       nodes.set(startNode.NodeID, transformNode(startNode));
//     }
//     if (endNode.NodeID && !nodes.has(endNode.NodeID)) {
//       nodes.set(endNode.NodeID, transformNode(endNode));
//     }

//     // Store relationships
//     if (relationship) {
//       links.push({
//         source: startNode.NodeID,
//         target: endNode.NodeID,
//         relationship: relationship.type,
//       });
//     }
//   });
// };

// module.exports = router;

const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();

  try {
    const state = req.query.state || "All";
    const product = req.query.product || "All";
    const type = req.query.type || "All";
    const subType = req.query.subType || "All";

    let nodes = new Map();
    let links = [];

    // ✅ If all parameters are "All", run the default query
    if (
      state === "All" &&
      product === "All" &&
      type === "All" &&
      subType === "All"
    ) {
      console.log("Running Default Query: Fetching all nodes");

      const defaultQuery = `
        MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100;
      `;
      const defaultResult = await session.run(defaultQuery);
      processResult(defaultResult, nodes, links);

      return res.json({
        success: true,
        nodes: Array.from(nodes.values()),
        links,
      });
    }

    // ✅ If any specific parameters have values, only run queries for those
    if (product !== "All") {
      await runQuery(
        session,
        `
        MATCH (n)-[r:HANDLES_PRODUCT]->(m:Product_Tags)
        WHERE m.NodeID = $productName
        RETURN n, r, m LIMIT 100;
      `,
        { productName: product },
        nodes,
        links
      );
    }

    if (state !== "All") {
      await runQuery(
        session,
        `
        MATCH (n)-[r:HAS_STATE]->(m:State)
        WHERE m.NodeID = $stateName
        RETURN n, r, m LIMIT 100;
      `,
        { stateName: state },
        nodes,
        links
      );
    }

    if (type !== "All") {
      await runQuery(
        session,
        `
        MATCH (n)-[r:HAS_TYPE]->(m:Organization_Type)
        WHERE m.NodeID = $type
        RETURN n, r, m LIMIT 100;
      `,
        { type },
        nodes,
        links
      );
    }

    if (subType !== "All") {
      await runQuery(
        session,
        `
        MATCH (n)-[r:HAS_SUBTYPE]->(m:Organization_Sub_Type)
        WHERE m.NodeID = $subTypeName
        RETURN n, r, m LIMIT 100;
      `,
        { subTypeName: subType },
        nodes,
        links
      );
    }

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

// ✅ Helper function to execute Neo4j queries
const runQuery = async (session, query, params, nodes, links) => {
  const result = await session.run(query, params);
  processResult(result, nodes, links);
};

// ✅ Helper function to process query results
const processResult = (result, nodes, links) => {
  result.records.forEach((record) => {
    const startNode = record.get("n")?.properties || {};
    const endNode = record.get("m")?.properties || {};
    const relationship = record.get("r");

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

    if (startNode.NodeID && !nodes.has(startNode.NodeID)) {
      nodes.set(startNode.NodeID, transformNode(startNode));
    }
    if (endNode.NodeID && !nodes.has(endNode.NodeID)) {
      nodes.set(endNode.NodeID, transformNode(endNode));
    }

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
