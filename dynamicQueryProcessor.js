const neo4j = require("neo4j-driver");
const OpenAI = require("openai");
require("dotenv").config();

class DynamicQueryProcessor {
  constructor(uri, user, password, openaiKey) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.schema = null;
  }

  async initialize() {
    // Fetch schema details
    const session = this.driver.session();
    try {
      const labelResult = await session.run(`
        CALL db.labels() YIELD label
        RETURN collect(label) as labels
      `);
      const labels = labelResult.records[0].get("labels");

      const relResult = await session.run(`
        CALL db.relationshipTypes() YIELD relationshipType
        RETURN collect(relationshipType) as types
      `);
      const relationshipTypes = relResult.records[0].get("types");

      const propertyKeys = {};
      for (const label of labels) {
        const propResult = await session.run(`
          MATCH (n:${label}) WITH n LIMIT 1
          RETURN keys(n) as properties
        `);
        if (propResult.records.length > 0) {
          propertyKeys[label] = propResult.records[0].get("properties");
        }
      }

      this.schema = { labels, relationshipTypes, propertyKeys };
    } finally {
      await session.close();
    }
  }

  async processNaturalLanguageQuery(userQuestion) {
    try {
      if (!this.schema) {
        await this.initialize();
      }

      // **Improved Schema Context for OpenAI**
      const schemaContext = `
      Available Node Labels: 
      - FamilyOffices
      - People
      - InvestmentVehicle
      - Asset
      - ServiceProvider
      - AdvisorProfessional
      - Organization
      - Philanthropic
      - Jurisdiction
      - Technology
      - KnowledgeCategory
      - RegulatoryBody
      - FamilyOfficeNetwork
    
      Relationship Types (Bidirectional Support - Always Use "<-[:RELATIONSHIP]->"):
      - ESTABLISHES: Connects Family Offices to People and AdvisorProfessional who established or employs them. **Use "<-[:ESTABLISHES]->" only.**
      - HOLDS: Links Investment Vehicles to Assets. **Use "<-[:HOLDS]->".**
      - RECEIVES_SERVICES_FROM: Shows Service Providers offering services. **Use "<-[:RECEIVES_SERVICES_FROM]->".**
      - EMPLOYS: Represents employment relationships with FamilyOfiices and Organization. **Use "<-[:EMPLOYS]->".**
      - INVESTS_IN: Captures investments in vehicles. **Use "<-[:INVESTS_IN]->".**
      - HAS_EQUITY: Represents equity stakes in InvestmentVehicle **only from ServiceProvider, AdvisorProfessional, or Organization**.  
        **Use:**
        \`\`\`
        MATCH (entity:ServiceProvider|AdvisorProfessional|Organization) <-[:HAS_EQUITY]-> (iv:InvestmentVehicle)
        RETURN entity.name, iv.name
        \`\`\`
      - OWNS: Captures ownership of Investment Vehicles **only by ServiceProvider, AdvisorProfessional, or Organization**.  
        **Use:**
        \`\`\`
        MATCH (entity:ServiceProvider|AdvisorProfessional|Organization) <-[:OWNS]-> (iv:InvestmentVehicle)
        RETURN entity.name, iv.name
        \`\`\`
      - ADVISES: Indicates advisory roles. **Use "<-[:ADVISES]->".**
      - CONNECTS_THROUGH: Highlights philanthropic connections. **Use "<-[:CONNECTS_THROUGH]->".**
    
      **Query Guidelines (Enforce Bidirectionality):**
      1. All relationships **must be bidirectional** using <-[:RELATIONSHIP]->.
      2. **HAS_EQUITY & OWNS must always match ServiceProvider, AdvisorProfessional, or Organization**.
      3. **Example (Correct Format for Equity Ownership Query):**
         \`\`\`
         MATCH (sp:ServiceProvider|AdvisorProfessional|Organization) <-[:HAS_EQUITY]-> (iv:InvestmentVehicle)
         RETURN sp.name AS Entity, iv.name AS Investment
         \`\`\`
      4. **Never use** one-sided relationships (-> or <- alone).
      5. Always use **WHERE** clauses to refine searches.
      6. Sort or aggregate results where applicable.
      7 Always use <- [] -> both side relation sheep this is complusory
      
      Return only the Cypher query without explanations.
    `;

      // Generate Cypher query using OpenAI
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: schemaContext },
          { role: "user", content: userQuestion },
        ],
      });

      const generatedQuery = completion.choices[0].message.content
        .trim()
        .replace(/```/g, "");

      // **Validate & Regenerate if Incorrect**
      // if (!generatedQuery.includes("-[:") && !generatedQuery.includes("<-[:")) {
      //   console.log(
      //     "Incorrect query generated (No relationships detected), regenerating..."
      //   );
      //   return await this.processNaturalLanguageQuery(userQuestion);
      // }

      console.log("Validated Query:", generatedQuery);

      // Execute the validated query
      const session = this.driver.session();
      try {
        const result = await session.run(generatedQuery);

        // Convert result into conversational format
        const responsePrompt = `
          Convert the following Neo4j query results into a conversational response:
          ${JSON.stringify(result.records.map((record) => record.toObject()))}
          
          Provide only a direct response without extra details. Do not mention tools, queries, or JSON.  
          If no data is found, simply return: "Sorry, I don't have information on that."
        `;

        const responseCompletion = await this.openai.chat.completions.create({
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant providing database query results in a user-friendly way.",
            },
            { role: "user", content: responsePrompt },
          ],
        });

        return {
          response: responseCompletion.choices[0].message.content,
          success: true,
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error processing query:", error);
      return {
        response:
          "I couldn't process your request. Please try asking a more specific question.",
        success: false,
      };
    }
  }
}

module.exports = DynamicQueryProcessor;
