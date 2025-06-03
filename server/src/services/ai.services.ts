import { getDocument } from "pdfjs-dist";
import redis from "../config/redis";
import { GoogleGenAI } from "@google/genai";

const AI_MODEL = "gemini-pro";
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY!);
const aiModel = genAI.getGenerativeModel({ model: AI_MODEL });

export const extractTextFromPDF = async (fileKey: string): Promise<string> => {
  try {
    const fileData = await redis.get(fileKey);
    if (!fileData) throw new Error("File not found");

    let fileBuffer: Uint8Array;

    if (Buffer.isBuffer(fileData)) {
      fileBuffer = new Uint8Array(fileData);
    } else if (
      typeof fileData === "object" &&
      fileData !== null &&
      (fileData as any).type === "Buffer" &&
      Array.isArray((fileData as any).data)
    ) {
      fileBuffer = new Uint8Array((fileData as any).data);
    } else {
      throw new Error("Invalid file data");
    }

    const pdf = await getDocument({ data: fileBuffer }).promise;
    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }

    return text;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to extract text from PDF. Error: ${error}`);
  }
};

export const detectContractType = async (contractText: string): Promise<string> => {
  const prompt = `
    Analyze the following contract text and determine the type of contract it is.
    Provide only the contract type as a single string (e.g., "Employment", "Non-Disclosure Agreement", "Sales", "Lease", etc.).
    Do not include any additional explanation or text.

    Contract text:
    ${contractText.substring(0, 2000)}
  `;

  const results = await aiModel.generateContent(prompt);
  const response = results.response;
  return response.text().trim();
};

interface IRisk {
  risk: string;
  explanation: string;
  severity?: string;
}

interface IOpportunity {
  opportunity: string;
  explanation: string;
  impact?: string;
}

interface FallbackAnalysis {
  risks: IRisk[];
  opportunities: IOpportunity[];
  summary: string;
  overallScore?: string;
}

export const analyzeContractWithAI = async (
  contractText: string,
  tier: "free" | "premium",
  contractType: string
): Promise<any> => {
  let prompt = "";

  if (tier === "premium") {
    prompt = `
    Analyze the following ${contractType} contract and provide:
    1. A list of at least 10 potential risks for the party receiving the contract, each with a brief explanation and severity level (low, medium, high).
    2. A list of at least 10 potential opportunities or benefits for the receiving party, each with a brief explanation and impact level (low, medium, high).
    3. A comprehensive summary of the contract, including key terms and conditions.
    4. Any recommendations for improving the contract from the receiving party's perspective.
    5. A list of key clauses in the contract.
    6. An assessment of the contract's legal compliance.
    7. A list of potential negotiation points.
    8. The contract duration or term, if applicable.
    9. A summary of termination conditions, if applicable.
    10. A breakdown of any financial terms or compensation structure, if applicable.
    11. Any performance metrics or KPIs mentioned, if applicable.
    12. A summary of any specific clauses relevant to this type of contract (e.g., intellectual property for employment contracts, warranties for sales contracts).
    13. An overall score from 1 to 100, with 100 being the highest.

    Format your response as a JSON object:
    {
      "risks": [{"risk": "", "explanation": "", "severity": "low|medium|high"}],
      "opportunities": [{"opportunity": "", "explanation": "", "impact": "low|medium|high"}],
      "summary": "",
      "recommendations": [""],
      "keyClauses": [""],
      "legalCompliance": "",
      "negotiationPoints": [""],
      "contractDuration": "",
      "terminationConditions": "",
      "overallScore": "",
      "financialTerms": {
        "description": "",
        "details": [""]
      },
      "performanceMetrics": [""],
      "specificClauses": ""
    }
    `;
  } else {
    prompt = `
    Analyze the following ${contractType} contract and provide:
    1. A list of at least 5 potential risks for the party receiving the contract.
    2. A list of at least 5 opportunities.
    3. A brief summary.
    4. An overall score from 1 to 100.

    Format:
    {
      "risks": [{"risk": "", "explanation": ""}],
      "opportunities": [{"opportunity": "", "explanation": ""}],
      "summary": "",
      "overallScore": ""
    }
    `;
  }

  prompt += `
    Important: Provide only the JSON object in your response, without any additional text or formatting.

    Contract text:
    ${contractText}
  `;

  const results = await aiModel.generateContent(prompt);
  const response = await results.response;
  let text = response.text().trim();

  // Remove potential code block formatting
  text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();

  try {
    const json = JSON.parse(text);
    return json;
  } catch (err) {
    console.error("Error parsing JSON:", err);
  }

  // Attempt to extract partial data as fallback
  const fallbackAnalysis: FallbackAnalysis = {
    risks: [],
    opportunities: [],
    summary: "Error analyzing contract",
  };

  const risksMatch = text.match(/"risks"\s*:\s*\[([\s\S]*?)\]/);
  if (risksMatch) {
    fallbackAnalysis.risks = risksMatch[1].split("},").map((risk) => {
      const riskMatch = risk.match(/"risk"\s*:\s*"([^"]*)"/);
      const explanationMatch = risk.match(/"explanation"\s*:\s*"([^"]*)"/);
      return {
        risk: riskMatch?.[1] || "Unknown",
        explanation: explanationMatch?.[1] || "Unknown",
      };
    });
  }

  const opportunitiesMatch = text.match(/"opportunities"\s*:\s*\[([\s\S]*?)\]/);
  if (opportunitiesMatch) {
    fallbackAnalysis.opportunities = opportunitiesMatch[1].split("},").map((op) => {
      const opMatch = op.match(/"opportunity"\s*:\s*"([^"]*)"/);
      const explanationMatch = op.match(/"explanation"\s*:\s*"([^"]*)"/);
      return {
        opportunity: opMatch?.[1] || "Unknown",
        explanation: explanationMatch?.[1] || "Unknown",
      };
    });
  }

  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]*)"/);
  if (summaryMatch) {
    fallbackAnalysis.summary = summaryMatch[1];
  }

  const scoreMatch = text.match(/"overallScore"\s*:\s*"([^"]*)"/);
  if (scoreMatch) {
    fallbackAnalysis.overallScore = scoreMatch[1];
  }

  return fallbackAnalysis;
};
