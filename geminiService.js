import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. API Key Setup
const genAI = new GoogleGenerativeAI("AIzaSyBXay3gKLp3WKlBCVEt4jWqmqRiYiOJEEI");

export async function getCompanyData(companyName) {
   
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        
    });

    
    const prompt = `Search for the latest 2026 interview terms, conditions, and 5 creative 
                    conditional interview questions for ${companyName}. 
                    Provide a 'Coach Tip' for each question.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("API Error:", error);
        return "Sorry";
    }
}