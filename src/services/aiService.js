import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Core function — all AI calls go through here
export const callAI = async (systemPrompt, userMessage, maxTokens = 1000) => {
  try {
    const response = await client.messages.create({
      model: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt
    });
    return { success: true, content: response.content[0].text };
  } catch (error) {
    console.error('AI service error:', error);
    return { success: false, error: error.message };
  }
};

// Vendor evaluation AI function
export const evaluateVendorWithAI = async (vendorData) => {
  const systemPrompt = `You are a procurement evaluation expert for KUN Real Estate, a leading real estate developer in Saudi Arabia.
Your job is to evaluate vendor/supplier qualification data and provide objective scores and recommendations.
You must respond ONLY with a valid JSON object, no markdown, no explanation outside the JSON.`;

  const userMessage = `Evaluate this vendor and return scores as JSON:

Vendor: ${vendorData.companyName}
Type: ${vendorData.vendorType}
Years in Business: ${vendorData.yearsInBusiness}
GOSI Employees: ${vendorData.gosiCount}
Categories: ${vendorData.categories?.join(', ')}
Documents uploaded: ${vendorData.documentsUploaded} of ${vendorData.totalDocuments} required
Expired documents: ${vendorData.expiredDocuments}
Project experience count: ${vendorData.projectCount}
Total project value: ${vendorData.totalProjectValue} SAR
Average RFQ response time: ${vendorData.avgResponseTime} hours
Previous evaluation score: ${vendorData.previousScore || 'None'}
RFQs participated: ${vendorData.rfqCount}
RFQs won: ${vendorData.rfqWon}

Scoring weights:
- Document Compliance: 20% (based on valid docs / total required)
- Technical Capability: 25% (based on certifications, experience, categories)
- Financial Strength: 20% (based on years in business, project values, financial docs)
- Experience: 25% (based on project count, values, diversity)
- Responsiveness: 10% (based on RFQ response times and participation rate)

Return ONLY this JSON:
{
  "documentScore": number 0-10,
  "technicalScore": number 0-10,
  "financialScore": number 0-10,
  "experienceScore": number 0-10,
  "responsivenessScore": number 0-10,
  "totalScore": number 0-100,
  "vendorClass": "A" or "B" or "C" or "D",
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendation": "APPROVE" or "CONDITIONAL_APPROVE" or "REJECT",
  "evaluationNotes": "2-3 sentence professional evaluation summary",
  "riskLevel": "LOW" or "MEDIUM" or "HIGH",
  "riskFactors": ["factor1", "factor2"] or []
}`;

  const result = await callAI(systemPrompt, userMessage, 800);
  if (!result.success) throw new Error(result.error);

  try {
    return JSON.parse(result.content);
  } catch {
    throw new Error('AI returned invalid JSON response');
  }
};

// AI Assistant query function
export const queryAIAssistant = async (question, contextData) => {
  const systemPrompt = `You are an intelligent procurement assistant for KUN Real Estate's procurement system (KUN ProcureTrack).
You have access to real procurement data and help procurement managers and officers make better decisions.
You answer questions about vendors, RFQs, purchase orders, costs, and procurement strategy.
Be concise, professional, and data-driven. Always base your answers on the provided data.
If the data doesn't support a confident answer, say so clearly.
Respond in the same language the question is asked in (Arabic or English).`;

  const userMessage = `Current system data:
${JSON.stringify(contextData, null, 2)}

User question: ${question}

Provide a helpful, concise answer based on the data above.`;

  return await callAI(systemPrompt, userMessage, 600);
};

// Smart insights generator
export const generateDashboardInsights = async (dashboardData) => {
  const systemPrompt = `You are a procurement analytics expert for KUN Real Estate.
Analyze procurement data and generate exactly 4 actionable insights.
Respond ONLY with valid JSON, no markdown.`;

  const userMessage = `Analyze this procurement data and generate insights:

${JSON.stringify(dashboardData, null, 2)}

Return ONLY this JSON:
{
  "insights": [
    {
      "title": "short title",
      "description": "1-2 sentence actionable insight",
      "type": "WARNING" or "OPPORTUNITY" or "INFO" or "ALERT",
      "metric": "relevant number or percentage",
      "action": "suggested action text",
      "actionUrl": "/relevant/page/path" or null
    }
  ]
}`;

  const result = await callAI(systemPrompt, userMessage, 800);
  if (!result.success) return { insights: [] };

  try {
    return JSON.parse(result.content);
  } catch {
    return { insights: [] };
  }
};

// Vendor matching for RFQ
export const matchVendorsForRFQ = async (rfqData, vendors) => {
  const systemPrompt = `You are a procurement expert for KUN Real Estate.
Match and rank vendors for an RFQ based on their qualifications, past performance, and relevance.
Respond ONLY with valid JSON.`;

  const userMessage = `RFQ Details:
Project: ${rfqData.projectName}
Scope: ${rfqData.scope}
CSI Categories: ${rfqData.categories?.join(', ')}
Estimated Value: ${rfqData.estimatedValue} SAR
Required Delivery: ${rfqData.requiredDate}

Available Qualified Vendors:
${vendors.map(v => `- ${v.companyName} (Class ${v.vendorClass}, Score: ${v.qualificationScore}, Categories: ${v.categories?.join(', ')}, Past RFQs Won: ${v.rfqsWon})`).join('\n')}

Return ONLY this JSON:
{
  "recommendations": [
    {
      "vendorId": number,
      "vendorName": "string",
      "matchScore": number 0-100,
      "reasons": ["reason1", "reason2"],
      "risk": "LOW" or "MEDIUM" or "HIGH"
    }
  ],
  "summary": "1-2 sentence explanation of the recommendations"
}`;

  const result = await callAI(systemPrompt, userMessage, 600);
  if (!result.success) return { recommendations: [], summary: '' };

  try {
    return JSON.parse(result.content);
  } catch {
    return { recommendations: [], summary: '' };
  }
};

// Savings analysis
export const analyzeSavings = async (projectName, poData, rfqData) => {
  const systemPrompt = `You are a cost optimization expert for KUN Real Estate procurement.
Analyze purchase order and RFQ data to identify cost savings opportunities.
Respond ONLY with valid JSON.`;

  const userMessage = `Analyze savings opportunities for: ${projectName}

Recent PO Data:
${JSON.stringify(poData, null, 2)}

Recent RFQ Comparison Data:
${JSON.stringify(rfqData, null, 2)}

Return ONLY this JSON:
{
  "estimatedSavings": number in SAR,
  "savingsPercentage": number,
  "opportunities": [
    {
      "description": "opportunity description",
      "potentialSaving": number in SAR,
      "action": "recommended action"
    }
  ],
  "summary": "2-3 sentence analysis"
}`;

  const result = await callAI(systemPrompt, userMessage, 600);
  if (!result.success) return null;

  try {
    return JSON.parse(result.content);
  } catch {
    return null;
  }
};
