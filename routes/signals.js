const express = require("express");
const { getDriver } = require("../neo4jConnection");

const router = express.Router();

router.get("/trusted-advisor-score", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();

    const vendorName = req.query.vendorName || "Deloitte"; // Set default to "Deloitte" if vendorName is not provided

    const result = await session.run(
      `
  MATCH (fo:FamilyOffices)-[r:EMPLOYS|RECEIVES_SERVICES_FROM]->(entity)
WHERE (entity:ServiceProvider OR entity:AdvisorProfessional) 
  AND entity.name = $vendorName
WITH entity, 
     collect(distinct fo.name) AS clientNames,  // Collect client names
     count(distinct fo) AS totalClients, 
     avg(toFloat(r.rating)) AS avgRating, 
     sum(toInteger(r.review_count)) AS totalReviews, // Sum of all review counts
     count(r) AS engagementCount
WITH entity, clientNames, totalClients, avgRating, totalReviews, engagementCount,
     CASE 
         WHEN avgRating >= 4 AND engagementCount > 1 THEN 'High-Trust Vendor'
         WHEN avgRating >= 3 AND engagementCount > 1 THEN 'Medium-Trust Vendor'
         WHEN avgRating >= 2 AND engagementCount = 1 THEN 'Low-Trust Vendor'
         ELSE 'Low-Trust Vendor'
     END AS trustLabel
RETURN entity.name AS EntityName, 
       labels(entity) AS EntityType, 
       clientNames, 
       totalClients, 
       avgRating, 
       totalReviews, 
       engagementCount, 
       trustLabel
ORDER BY avgRating DESC;
      `,
      { vendorName }
    );

    const data = result.records.map((record) => {
      return {
        entityName: record.get("EntityName"),
        entityType: record.get("EntityType"),
        clientNames: record.get("clientNames"), // Extracting client names
        totalClients: record.get("totalClients").low,
        avgRating: record.get("avgRating"),
        totalReviews: record.get("totalReviews")?.low || 0, // Extracting total review count
        trustLabel: record.get("trustLabel"),
        engagementCount: record.get("engagementCount")?.low || 0,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching Trusted Advisor Score:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/non-obvious-connections", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();
    const foName = req.query.foName;

    // Running the query to find non-obvious connections
    const result = await session.run(
      `
      MATCH path = (fo1:FamilyOffices)-[:EMPLOYS|RECEIVES_SERVICES_FROM|CONNECTS_THROUGH*2..3]-(fo2:FamilyOffices)
WHERE fo1.name = $foName AND fo1 <> fo2
WITH fo1, fo2, path,
    reduce(score = 0, r IN relationships(path) | score +
        CASE
            WHEN type(r) = "EMPLOYS" THEN 5
            WHEN type(r) = "RECEIVES_SERVICES_FROM" THEN 5
            WHEN type(r) = "CONNECTS_THROUGH" THEN 5
            ELSE 1
        END) AS TrustScore
RETURN fo1.name AS FamilyOffice, fo2.name AS ConnectedFamilyOffice, TrustScore, path
ORDER BY TrustScore DESC;

      `,
      { foName }
    );

    let messages = [];

    // Iterating through the result set
    result.records.forEach((record) => {
      const fo1 = record.get("FamilyOffice");
      const fo2 = record.get("ConnectedFamilyOffice");
      const trustScore = record.get("TrustScore").low;
      const path = record.get("path");

      let advisor = null;
      let serviceProvider = null;
      let philanthropicNetwork = null;

      // Extract node relationships
      path.segments.forEach((segment, index) => {
        const startNode = segment.start;
        const relationship = segment.relationship;
        const endNode = segment.end;

        // Check if endNode and its properties are properly defined
        if (endNode && endNode.properties) {
          const nodeName = endNode.properties.name;

          // Check for EMPLOYS relationship
          if (relationship.type === "EMPLOYS" && !advisor) {
            advisor = nodeName;
          }
          // Check for RECEIVES_SERVICES_FROM relationship
          else if (
            relationship.type === "RECEIVES_SERVICES_FROM" &&
            !serviceProvider
          ) {
            serviceProvider = nodeName;
          }
          // Check for CONNECTS_THROUGH relationship
          else if (
            relationship.type === "CONNECTS_THROUGH" &&
            !philanthropicNetwork
          ) {
            philanthropicNetwork = nodeName;
          }
        }
      });

      // Generate meaningful messages based on the relationships
      if (advisor) {
        messages.push(
          `You and ${fo2} share the same legal advisor (${advisor}).`
        );
      }

      // if (serviceProvider) {
      //   messages.push(
      //     `Two steps away, your vendor (${serviceProvider}) is partnered with a known philanthropic network.`
      //   );
      // }

      if (philanthropicNetwork) {
        messages.push(
          `You are indirectly connected to ${fo2} through a shared philanthropic network (${philanthropicNetwork}).`
        );
      }
    });

    await session.close();

    // Sending response with success and messages
    res.json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching Non-Obvious Connections:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/co-investor-partnership-synergy", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();

    const entityName = req.query.entityName; // User provides either FO or ORG name
    if (!entityName) {
      return res
        .status(400)
        .json({ success: false, message: "Entity name is required" });
    }

    // **Step 1: Identify if the given entity name belongs to any valid entity**
    const typeResult = await session.run(
      `
      MATCH (entity {name: $entityName})
      WHERE ANY(label IN labels(entity) WHERE label IN $validLabels)
      RETURN labels(entity) AS entityType
      `,
      {
        entityName,
        validLabels: [
          "FamilyOffices",
          "Organization",
          "AdvisorProfessional",
          "ServiceProvider",
        ], // You can add other labels dynamically
      }
    );

    if (typeResult.records.length === 0) {
      return res.json({
        success: true,
        message: [],
      });
    }

    const entityType = typeResult.records[0].get("entityType")[0]; // Either "FamilyOffices", "Organization", or "AdvisorProfessional"
    console.log(`Identified entity type: ${entityType}`);

    // **Step 2: Run the main query to find co-investors**
    const result = await session.run(
      `
      MATCH (entity {name: $entityName})-[:INVESTS_IN]->(iv:InvestmentVehicle)
      MATCH (otherEntity)-[:INVESTS_IN]->(iv)
      WHERE otherEntity <> entity // Exclude itself
        AND ANY(label IN labels(otherEntity) WHERE label IN $validLabels) // Check if the other entity is FO or ORG

      WITH iv, otherEntity,
           count(iv) AS overlapCount,
           COLLECT(DISTINCT otherEntity) AS sharedPartners,
           AVG(CASE WHEN iv.risk_level = 'High' THEN 1 ELSE 0 END) AS highRiskOverlap,
           AVG(CASE WHEN iv.risk_level = 'Medium' THEN 1 ELSE 0 END) AS mediumRiskOverlap,
           AVG(CASE WHEN iv.risk_level = 'Low' THEN 1 ELSE 0 END) AS lowRiskOverlap,
           AVG(toFloat(iv.expected_return)) AS avgReturn,
           COLLECT(DISTINCT iv.jurisdiction) AS sharedJurisdictions
      ORDER BY overlapCount DESC, avgReturn DESC
      RETURN iv.name AS SharedVehicle,
             iv.vehicle_type AS VehicleType,  // Updated from iv.type to iv.vehicle_type
             iv.risk_level AS RiskLevel,
             iv.expected_return AS ExpectedReturn,
             COLLECT(DISTINCT otherEntity.name) AS Partners,
             COLLECT(DISTINCT labels(otherEntity)) AS PartnerTypes,
             overlapCount AS SharedPartnerCount,
             highRiskOverlap AS HighRiskOverlap,
             mediumRiskOverlap AS MediumRiskOverlap,
             lowRiskOverlap AS LowRiskOverlap,
             avgReturn AS AvgReturn,
             sharedJurisdictions AS SharedJurisdictions
      LIMIT 5;
      `,
      {
        entityName,
        validLabels: [
          "FamilyOffices",
          "Organization",
          "AdvisorProfessional",
          "ServiceProvider",
        ], // Same valid labels
      }
    );

    if (result.records.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const data = result.records.reduce((acc, record) => {
      const sharedVehicle = record.get("SharedVehicle");
      const vehicleType = record.get("VehicleType");
      const riskLevel = record.get("RiskLevel");
      const expectedReturn = record.get("ExpectedReturn");
      const sharedPartners = record.get("Partners");
      const sharedPartnerTypes = record.get("PartnerTypes");
      const sharedPartnerCount = sharedPartners.length; // Correct the count to match partners array length

      // Include vehicle details in the shared vehicle
      const sharedVehicleDetails = `${sharedVehicle} (${
        vehicleType || "Unknown Type"
      }, ${riskLevel} Risk, ${expectedReturn}% Return)`;

      const avgReturn = record.get("AvgReturn");
      const highRiskOverlap = record.get("HighRiskOverlap");
      const mediumRiskOverlap = record.get("MediumRiskOverlap");
      const lowRiskOverlap = record.get("LowRiskOverlap");
      const sharedJurisdictions = record.get("SharedJurisdictions").join(", ");

      const recommendation = `You have ${sharedPartnerCount} partners sharing the ${sharedVehicleDetails} investment vehicle.`;
      // These partners have a strong track record in ${sharedJurisdictions}.
      // Construct shared partners with types
      const partnersWithTypes = sharedPartners.map((partner, index) => {
        const partnerType = sharedPartnerTypes[index].includes("FamilyOffices")
          ? "Family Office"
          : sharedPartnerTypes[index].includes("Organization")
          ? "Organization"
          : sharedPartnerTypes[index].includes("AdvisorProfessional")
          ? "Advisor"
          : "Other"; // Default for unrecognized types
        return { partner, partnerType };
      });

      // Group by sharedVehicles to merge partners
      if (!acc[sharedVehicleDetails]) {
        acc[sharedVehicleDetails] = {
          recommendation,
          sharedVehicles: sharedVehicleDetails,
          sharedPartners: partnersWithTypes,
          avgReturn: avgReturn ? `${avgReturn}%` : null,
          riskLevels: {
            highRiskOverlap,
            mediumRiskOverlap,
            lowRiskOverlap,
          },
          sharedJurisdictions,
        };
      } else {
        // If the shared vehicle already exists, merge partners and update recommendation
        acc[sharedVehicleDetails].sharedPartners.push(...partnersWithTypes);
      }

      return acc;
    }, {});

    const finalData = Object.values(data); // Convert the grouped results to an array for final response

    res.json({ success: true, data: finalData });
  } catch (error) {
    console.error("Error fetching Co-Investor & Partnership Synergy:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  } finally {
    // await session.close();
  }
});

router.get("/conflict-of-interest", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();

    const entityName = req.query.entityName;
    const result = await session.run(
      `
      MATCH (entity)
      WHERE entity.name = $entityName

      // Match Advisors (EMPLOYS/ADVISES/RECEIVES_SERVICES_FROM) and their related Investment Vehicles (OWN/Has_Equity)

         OPTIONAL MATCH (entity)-[:EMPLOYS|ADVISES|RECEIVES_SERVICES_FROM]->(advisor)
         WHERE (advisor:AdvisorProfessional OR advisor:ServiceProvider)

      OPTIONAL MATCH (advisor)-[:HAS_EQUITY|OWNS]->(iv:InvestmentVehicle)

      // Match Service Providers (RECEIVES_SERVICES_FROM) and their related Investment Vehicles (OWN/Has_Equity)
      OPTIONAL MATCH (serviceProvider:ServiceProvider)-[:HAS_EQUITY|OWNS]->(iv)

      WITH entity, advisor, iv, serviceProvider,
           COLLECT(DISTINCT advisor.name) AS Advisors,
           COLLECT(DISTINCT iv.name) AS EquityVehicles,
           COLLECT(DISTINCT serviceProvider.name) AS ServiceProviders

      WHERE SIZE(Advisors) > 0 OR SIZE(EquityVehicles) > 0 OR SIZE(ServiceProviders) > 0

      RETURN entity.name AS Entity,
             Advisors,
             EquityVehicles,
             ServiceProviders
      `,
      { entityName }
    );

    // Group the results by entity and handle conflicts
    const groupedData = {};
    result.records.forEach((record) => {
      const entityName = record.get("Entity");
      const advisors = record.get("Advisors");
      const equityVehicles = record.get("EquityVehicles");
      const serviceProviders = record.get("ServiceProviders");

      if (!groupedData[entityName]) {
        groupedData[entityName] = {
          entity: entityName,
          advisors: [],
          equityVehicles: [],
          serviceProviders: [],
          alerts: [],
        };
      }

      // Handle Advisor Conflict Details
      advisors.forEach((advisorName) => {
        equityVehicles.forEach((vehicle) => {
          groupedData[entityName].advisors.push({
            name: advisorName,
            conflictDetails: [
              {
                vehicle,
                alert: `${advisorName} has an equity stake in the same ${vehicle} you're negotiating with—potential conflict!`,
              },
            ],
          });
        });
      });

      // Handle Service Provider Conflict Details
      serviceProviders.forEach((serviceProviderName) => {
        equityVehicles.forEach((vehicle) => {
          groupedData[entityName].serviceProviders.push({
            name: serviceProviderName,
            conflictDetails: [
              {
                vehicle,
                alert: `${serviceProviderName} owns the same ${vehicle} you're involved with—potential conflict!`,
              },
            ],
          });
        });
      });

      // Handle Equity Vehicle Details
      equityVehicles.forEach((vehicle) => {
        groupedData[entityName].equityVehicles.push({
          name: vehicle,
          involvedAdvisors: advisors,
          involvedServiceProviders: serviceProviders,
        });
      });

      // Add a general conflict alert if advisors or service providers are involved
      if (advisors.length > 0 || serviceProviders.length > 0) {
        groupedData[entityName].alerts.push(
          `${entityName} may have potential conflicts of interest involving advisors or service providers.`
        );
      }
    });

    // Format the response
    const data = Object.values(groupedData).map((entry) => ({
      entity: entry.entity,
      advisors: entry.advisors.map((advisor) => ({
        name: advisor.name,
        conflictDetails: advisor.conflictDetails,
      })),
      equityVehicles: entry.equityVehicles.map((vehicle) => ({
        name: vehicle.name,
        involvedAdvisors: vehicle.involvedAdvisors,
        involvedServiceProviders: vehicle.involvedServiceProviders,
      })),
      serviceProviders: entry.serviceProviders,
      alerts: entry.alerts.length ? entry.alerts : ["✅ No conflicts detected"],
    }));

    res.json({
      success: true,
      message:
        data.length > 0
          ? "Conflicts detected."
          : "No conflicts of interest found.",
      data,
    });

    await session.close();
  } catch (error) {
    console.error("Error fetching Conflict of Interest signal:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/collaborative-network-strength", async (req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();
    const entityName = req.query.entityName;

    if (!entityName) {
      return res
        .status(400)
        .json({ success: false, message: "Entity name is required." });
    }

    // Step 1: Fetch Network Data for the specified entity
    const networkQuery = `
      MATCH (entity)
      WHERE entity.name = $entityName
      OPTIONAL MATCH (entity)-[:EMPLOYS|ADVISES]->(advisor:AdvisorProfessional)
      OPTIONAL MATCH (entity)-[:RECEIVES_SERVICES_FROM]->(provider:ServiceProvider)
      OPTIONAL MATCH (entity)-[:INVESTS_IN]->(investment:InvestmentVehicle)
      OPTIONAL MATCH (entity)-[:CONNECTS_THROUGH]->(philanthropy:Philanthropy)
      OPTIONAL MATCH (entity)-[:CO_INVESTS_WITH]->(coFo:FamilyOffices)
      
      WITH entity, 
           COLLECT(DISTINCT advisor.name) AS Advisors,
           COLLECT(DISTINCT provider.name) AS ServiceProviders,
           COLLECT(DISTINCT investment.name) AS Investments,
           COLLECT(DISTINCT philanthropy.name) AS PhilanthropicConnections,
           COLLECT(DISTINCT coFo.name) AS CoInvestors
      
      RETURN entity.name AS Entity, Advisors, ServiceProviders, Investments, PhilanthropicConnections, CoInvestors`;

    const networkResult = await session.run(networkQuery, { entityName });

    // Step 2: Process Data into Desired Structure
    const responseData = networkResult.records.map((record) => {
      const entityName = record.get("Entity");
      const advisors = record.get("Advisors") || [];
      const serviceProviders = record.get("ServiceProviders") || [];
      const investments = record.get("Investments") || [];
      const philanthropicConnections =
        record.get("PhilanthropicConnections") || [];
      const coInvestors = record.get("CoInvestors") || [];

      // Calculate Total Connections
      const totalConnections =
        advisors.length +
        serviceProviders.length +
        investments.length +
        philanthropicConnections.length +
        coInvestors.length;

      const normalizedStrength = totalConnections / 10; // Normalization to 0-1 based on expected connections (can adjust the factor here)
      const comparativeRanking =
        normalizedStrength > 0.75
          ? "Above Average"
          : normalizedStrength > 0.5
          ? "Average"
          : "Below Average";

      return {
        entity: entityName,
        networkStrength: normalizedStrength.toFixed(2), // Scaled value between 0-1
        comparativeRanking,
        topConnectedAdvisors: advisors.map((name) => ({ name })),
        topServiceProviders: serviceProviders.map((name) => ({ name })),
        topInvestments: investments.map((name) => ({ name })),
        philanthropicConnections: philanthropicConnections.map((name) => ({
          name,
        })),
        coInvestors: coInvestors.map((name) => ({ name })),
      };
    });

    res.json({
      success: true,
      message: responseData.length
        ? "Network strength calculated."
        : "No data found.",
      data: responseData,
    });

    // await session.close();
  } catch (error) {
    console.error("Error fetching Collaborative Network Strength:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.get("/sp-matched-with-country-interest", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();
  const familyOfficeName = req.query.familyOfficeName;

  if (!familyOfficeName) {
    return res.status(400).json({
      success: false,
      message: "Family Office name is required.",
    });
  }

  try {
    // Cypher Query to Find Service Providers with the Same Interest in the Same Country
    const query = `
    MATCH (fo:family_office_contacts {NodeID: $familyOfficeName})-[:BELONGS_TO_COUNTRY]->(c:countries)
    MATCH (fo)-[:INTERESTS_IN]->(interest:interests)
MATCH (sp:service_providers)-[:INTERESTS_IN]->(interest)
MATCH (sp)-[:BELONGS_TO_COUNTRY]->(c)  
RETURN DISTINCT 
  sp.NodeID AS ServiceProvider, 
  c.NodeID AS Country, 
  COLLECT(DISTINCT interest.NodeID) AS CommonInterests;

    `;

    const result = await session.run(query, { familyOfficeName });

    // Process Data into Response Format
    const responseData = result.records.map((record) => ({
      serviceProvider: record.get("ServiceProvider"),
      country: record.get("Country"),
      commonInterests: record.get("CommonInterests"),
    }));

    res.json({
      success: true,
      message: responseData.length
        ? "Matching service providers found."
        : "No matching service providers found.",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching service providers:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  } finally {
    await session.close(); // Ensure session closure
  }
});

router.get("/fo-matched-with-country-interest", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();
  const familyOfficeName = req.query.familyOfficeName;

  if (!familyOfficeName) {
    return res.status(400).json({
      success: false,
      message: "Family Office name is required.",
    });
  }

  try {
    // Cypher Query to Find Other Family Offices with the Same Interest in the Same Country
    const query = `
    MATCH (fo:family_office_contacts {NodeID: $familyOfficeName})-[:BELONGS_TO_COUNTRY]->(c:countries)
    MATCH (fo)-[:INTERESTS_IN]->(interest:interests)
    MATCH (otherFO:family_office_contacts)-[:INTERESTS_IN]->(interest)
    MATCH (otherFO)-[:BELONGS_TO_COUNTRY]->(c)
    WHERE otherFO.NodeID <> $familyOfficeName
    RETURN DISTINCT 
      otherFO.NodeID AS FamilyOffice, 
      c.NodeID AS Country, 
      COLLECT(DISTINCT interest.NodeID) AS CommonInterests;
    `;

    const result = await session.run(query, { familyOfficeName });

    // Process Data into Response Format
    const responseData = result.records.map((record) => ({
      familyOffice: record.get("FamilyOffice"),
      country: record.get("Country"),
      commonInterests: record.get("CommonInterests"),
    }));

    res.json({
      success: true,
      message: responseData.length
        ? "Matching family offices found."
        : "No matching family offices found.",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching family offices:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  } finally {
    await session.close(); // Ensure session closure
  }
});

router.get("/top-service-providers", async (req, res) => {
  const driver = getDriver();
  const session = driver.session();
  const { segment, country } = req.query;

  if (!segment || !country) {
    return res.status(400).json({
      success: false,
      message: "Both segment and country are required.",
    });
  }

  try {
    // Cypher Query to Fetch Top 3 Service Providers with Highest Trust Score
    // const query = `
    //   MATCH (sp:service_providers)
    //   WHERE sp.segment = $segment AND sp.country = $country
    //   WITH sp,
    //        TOINTEGER(sp.phone_calls) AS phoneCalls,
    //        TOINTEGER(sp.deals) AS leads,
    //        TOINTEGER(sp.forms_submitted) AS formsSubmitted,
    //        (TOINTEGER(sp.phone_calls) +
    //         TOINTEGER(sp.deals) +
    //         TOINTEGER(sp.forms_submitted)) AS trustScore
    //   ORDER BY trustScore DESC
    //   LIMIT 10
    //   RETURN
    //     sp.NodeID AS serviceProvider,
    //     sp.company AS company,
    //     sp.country AS country,
    //     sp.segment AS segment,
    //     phoneCalls,
    //     leads,
    //     formsSubmitted,
    //     trustScore;
    // `;

    const query = `MATCH (sp:service_providers)
WHERE sp.segment = $segment AND sp.country = $country
WITH sp, 
     TOINTEGER(sp.phone_calls) AS phoneCalls,
     TOINTEGER(sp.deals) AS deals,
     TOINTEGER(sp.forms_submitted) AS formsSubmitted,
     (TOINTEGER(sp.phone_calls) + 
      TOINTEGER(sp.deals) + 
      TOINTEGER(sp.forms_submitted)) AS trustScore
ORDER BY trustScore DESC, phoneCalls DESC, deals DESC, formsSubmitted DESC, sp.NodeID ASC
LIMIT 3
RETURN 
    sp.NodeID AS serviceProvider,
    sp.company AS company,
    sp.country AS country,
    sp.segment AS segment,
    phoneCalls,
    deals,
    formsSubmitted,
    trustScore;
`;

    const result = await session.run(query, { segment, country });

    // Process Data into Response Format
    const responseData = result.records.map((record) => ({
      serviceProvider: record.get("serviceProvider"),
      company: record.get("company"),
      country: record.get("country"),
      segment: record.get("segment"),
      phoneCalls: record.get("phoneCalls").toNumber(),
      leads: record.get("deals").toNumber(),
      formsSubmitted: record.get("formsSubmitted").toNumber(),
      trustScore: record.get("trustScore").toNumber(),
    }));

    res.json({
      success: true,
      message: responseData.length
        ? "Top service providers found."
        : "No matching service providers found.",
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching service providers:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  } finally {
    await session.close(); // Ensure session closure
  }
});

module.exports = router;
