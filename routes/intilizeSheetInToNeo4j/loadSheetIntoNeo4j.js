import axios from "axios";
import { getDriver } from "../neo4jDriver";
import csv from "csv-parse";

const sanitizePropertyName = (columnName) => {
  return columnName
    .replace(/[()\/\s]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");
};

const fetchAndParseCSV = async (url) => {
  try {
    const response = await axios.get(url);
    return new Promise((resolve, reject) => {
      csv.parse(
        response.data,
        {
          columns: true,
          skip_empty_lines: true,
        },
        (err, records) => {
          if (err) reject(err);
          resolve(records);
        }
      );
    });
  } catch (error) {
    console.error("Error fetching CSV:", error);
    throw error;
  }
};

export const loadCSVIntoNeo4j = async ({ nodesUrl, relationshipsUrl }) => {
  const driver = getDriver();
  const session = driver.session();

  try {
    const nodeRecords = await fetchAndParseCSV(nodesUrl);
    const columnMapping = {};

    Object.keys(nodeRecords[0]).forEach((col) => {
      if (col !== "NodeID") {
        columnMapping[col] = sanitizePropertyName(col);
      }
    });

    const sanitizedRecords = nodeRecords.map((record) => {
      const sanitizedRecord = { NodeID: record.NodeID };
      Object.entries(columnMapping).forEach(([originalCol, sanitizedCol]) => {
        sanitizedRecord[sanitizedCol] = record[originalCol];
      });
      return sanitizedRecord;
    });

    const nodeResult = await session.run(
      `
      WITH $records AS records
      UNWIND records AS row
      MERGE (n:Node {NodeID: row.NodeID})
      SET ${Object.entries(columnMapping)
        .map(
          ([originalCol, sanitizedCol]) =>
            `n.${sanitizedCol} = row.${sanitizedCol}`
        )
        .join(", ")}
      RETURN count(n) as nodesCreated
      `,
      { records: sanitizedRecords }
    );

    console.log(
      `Created/Updated ${nodeResult.records[0].get("nodesCreated")} nodes`
    );

    const relationshipRecords = await fetchAndParseCSV(relationshipsUrl);
    const nodeCheck = await session.run(
      `MATCH (n:Node) RETURN count(n) as nodeCount`
    );
    const nodeCount = nodeCheck.records[0].get("nodeCount");

    if (nodeCount === 0) {
      throw new Error(
        "No nodes found in database. Please ensure nodes are created first."
      );
    }

    for (const record of relationshipRecords) {
      try {
        const result = await session.run(
          `
          MATCH (source:Node {NodeID: $startId})
          MATCH (target:Node {NodeID: $endId})
          MERGE (source)-[r:${record.RelationshipType}]->(target)
          SET r = $properties
          RETURN source.id, target.id
          `,
          {
            startId: record.StartNodeID,
            endId: record.EndNodeID,
            properties: {
              relId: record.RelID,
              properties: record.Properties,
              notes: record.Notes,
            },
          }
        );

        if (result.records.length > 0) {
          console.log(
            `Created relationship: ${record.StartNodeID} -[${record.RelationshipType}]-> ${record.EndNodeID}`
          );
        }
      } catch (error) {
        console.error(
          `Error creating relationship ${record.RelID}:`,
          error.message
        );
      }
    }

    console.log("\nRelationship counts by type:");
    const verifyResult = await session.run(
      `MATCH ()-[r]->() RETURN type(r) as relType, count(r) as count`
    );
    verifyResult.records.forEach((record) => {
      console.log(`${record.get("relType")}: ${record.get("count")}`);
    });

    console.log("\nSample relationships:");
    const sampleResult = await session.run(
      `
      MATCH (source)-[r]->(target)
      RETURN source.id as sourceId, type(r) as relType, target.id as targetId
      LIMIT 5
      `
    );

    sampleResult.records.forEach((record) => {
      console.log(
        `${record.get("sourceId")} -[${record.get("relType")}]-> ${record.get(
          "targetId"
        )}`
      );
    });
  } catch (error) {
    console.error("Error loading data into Neo4j:", error);
    throw error;
  } finally {
    await session.close();
  }
};
