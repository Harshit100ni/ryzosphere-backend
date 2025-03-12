const { google } = require("googleapis");
const neo4j = require("neo4j-driver");
require("dotenv").config();
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

class PublicSheetsNeo4jImporter {
  constructor() {
    this.sheets = google.sheets({
      version: "v4",
      auth: GOOGLE_SHEETS_API_KEY,
    });
    this.neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
    );
  }

  async getAllSheetNames(spreadsheetId) {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId,
      key: GOOGLE_SHEETS_API_KEY,
    });

    return response.data.sheets.map((sheet) => sheet.properties.title);
  }

  async importSheetToDB(spreadsheetId, sheetName) {
    const normalizedSheetName = sheetName.trim().replace(/\s+/g, "_"); // Normalize sheet name

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ`,
    });

    const rows = response.data.values;

    const dataRows = rows.slice(0);

    const headers = dataRows[0].map((header) => {
      if (header === "Name") {
        return "NodeID";
      } else {
        return header.trim().toLowerCase().replace(/\s+/g, "_");
      }
    });

    // const dataToImport = dataRows.slice(1);
    const dataToImport = dataRows
      .slice(1)
      .filter((row) => row.some((cell) => cell && cell.trim() !== ""));

    const cleanedDataToImport = dataToImport.map((row) => row);

    console.log({ dataRows, sheetName, headers, cleanedDataToImport });

    const session = this.neo4jDriver.session({ database: "neo4j" });

    try {
      // Create constraint in a separate transaction
      const constraintTx = session.beginTransaction();
      await constraintTx.run(`
          CREATE CONSTRAINT unique_${normalizedSheetName.toLowerCase()} 
          IF NOT EXISTS FOR (n:${normalizedSheetName}) REQUIRE n.id IS UNIQUE
      `);
      await constraintTx.commit();

      // Import data in another transaction
      const dataTx = session.beginTransaction();
      const importPromises = cleanedDataToImport.map(async (row, i) => {
        const nodeProperties = headers.reduce((acc, header, index) => {
          acc[header] = row[index] || null;
          return acc;
        }, {});

        nodeProperties.id = `${normalizedSheetName}_${i + 1}`;

        const createQuery = `
            MERGE (n:${normalizedSheetName} {id: $id})
            SET n += $properties
        `;

        await dataTx.run(createQuery, {
          id: nodeProperties.id,
          properties: nodeProperties,
        });
      });

      await Promise.all(importPromises);
      await dataTx.commit();
      console.log(`Imported ${sheetName}: ${cleanedDataToImport.length} nodes`);
    } catch (error) {
      console.error(`Error importing ${sheetName}:`, error);
    } finally {
      await session.close();
    }
  }

  async importRelationshipsToDB(spreadsheetId, sheetName) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log(`No data found in ${sheetName}`);
      return;
    }

    const headers = rows[0].map((header) =>
      header.trim().toLowerCase().replace(/\s+/g, "_")
    );

    const startNodeIndex = headers.indexOf("startnodeid");
    const relationshipTypeIndex = headers.indexOf("relationshiptype");
    const endNodeIndex = headers.indexOf("endnodeid");
    const propertiesIndex = headers.indexOf("properties");
    const relIDIndex = headers.indexOf("relid");
    const notesIndex = headers.indexOf("notes");
    const node1Index = headers.indexOf("startnode");
    const node2Index = headers.indexOf("endnode");

    if (
      startNodeIndex === -1 ||
      relationshipTypeIndex === -1 ||
      endNodeIndex === -1
    ) {
      console.error("Missing required columns in Relationships sheet.");
      return;
    }

    const relationshipData = rows.slice(1); // Skipping header row

    const session = this.neo4jDriver.session({ database: "neo4j" });
    const tx = session.beginTransaction();

    try {
      for (const row of relationshipData) {
        const startNodeId = row[startNodeIndex]?.trim();
        const relationshipType = row[relationshipTypeIndex]
          ?.trim()
          .toUpperCase();
        const endNodeId = row[endNodeIndex]?.trim();
        const propertiesRaw = row[propertiesIndex] || "";
        const relId = row[relIDIndex] || ""; // Get relId from the sheet
        const notes = row[notesIndex] || ""; // Get notes from the sheet
        const startNode = row[node1Index];
        const endNode = row[node2Index];

        if (!startNodeId || !relationshipType || !endNodeId) {
          console.error("Invalid relationship data:", row);
          continue;
        }

        // Parse properties string into an object
        const properties = {};
        if (propertiesRaw && propertiesRaw.includes(":")) {
          propertiesRaw.split(",").forEach((prop) => {
            const [key, value] = prop.split(":").map((s) => s.trim());
            properties[key.replace(/\s+/g, "_").toLowerCase()] = value;
          });
        }

        // console.log("Creating Relationship:", {
        //   startNodeId,
        //   endNodeId,
        //   relationshipType,
        //   properties,
        //   relId,
        //   startNode,
        //   endNode,
        //   notes,
        // });

        // Check if nodes exist before creating relationship
        const nodeCheck = await tx.run(
          `
        MATCH (start:${startNode} {NodeID: $startId}), (end:${endNode} {NodeID: $endId})
        RETURN start, end
        `,
          {
            startNode,
            endNode,
            startId: startNodeId,
            endId: endNodeId,
          }
        );

        // if (nodeCheck.records.length === 0) {
        //   console.error(
        //     `Nodes not found for relationship: ${startNodeId} -> ${endNodeId}`
        //   );
        //   continue;
        // }

        // Relationship query with parameterization
        const result = await tx.run(
          `
        MATCH (source:${startNode} {NodeID: $startId})
        MATCH (target:${endNode} {NodeID: $endId})
        MERGE (source)-[r:${relationshipType}]->(target)
        SET r = $properties
        RETURN source.id, target.id
        `,
          {
            startId: startNodeId,
            endId: endNodeId,
            properties: properties,
            startNode: startNode,
            endNode: endNode,
            relationshipType: relationshipType,
          }
        );

        console.log("Created relationship:", result);

        if (result.records.length > 0) {
          console.log(
            `Created relationship: ${startNodeId} -[${relationshipType}]-> ${endNodeId}`
          );
        }
      }

      await tx.commit();
      console.log(`Relationships from ${sheetName} created successfully.`);
    } catch (error) {
      await tx.rollback();
      console.error(`Error importing relationships from ${sheetName}:`, error);
    } finally {
      await session.close();
    }
  }

  async importAllSheets(spreadsheetId) {
    console.log(spreadsheetId);
    const sheetNames = await this.getAllSheetNames(spreadsheetId);
    console.log(sheetNames);

    // Separate node sheets and relationship sheet
    const nodeSheets = sheetNames.filter((name) => name !== "Relationships");
    const relationshipSheet = sheetNames.find(
      (name) => name === "Relationships"
    );

    console.log("Node Sheets:", nodeSheets);
    console.log("Relationship Sheet:", relationshipSheet);

    // Step 1: Process Node Sheets
    if (nodeSheets.length > 0) {
      await Promise.all(
        nodeSheets.map((sheetName) =>
          this.importSheetToDB(spreadsheetId, sheetName)
        )
      );
      console.log("Node sheets processed successfully.");
    }

    // Step 2: Process Relationship Sheet

    if (relationshipSheet) {
      console.log("Processing relationship sheet...");
      await this.importRelationshipsToDB(spreadsheetId, relationshipSheet);
      console.log("Relationship sheet processed successfully.");
    } else {
      console.log("No relationship sheet found.");
    }
  }

  async close() {
    await this.neo4jDriver.close();
  }
}

module.exports = PublicSheetsNeo4jImporter;
